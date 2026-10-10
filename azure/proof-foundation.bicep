targetScope = 'resourceGroup'

param location string = resourceGroup().location
param operatorObjectId string
@secure()
param databaseOwnerPassword string
@secure()
param databaseRuntimePassword string
@secure()
param entraClientSecret string
@secure()
param sessionSecret string

var suffix = uniqueString(resourceGroup().id)
var tags = { project: 'soyl-forms', environment: 'auth-proof', owner: 'soyl' }
var secretUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'soyl-forms-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.48.0.0/16'] }
    subnets: [
      {
        name: 'apps'
        properties: {
          addressPrefix: '10.48.0.0/23'
          delegations: [{ name: 'container-apps', properties: { serviceName: 'Microsoft.App/environments' } }]
        }
      }
      {
        name: 'database'
        properties: {
          addressPrefix: '10.48.2.0/27'
          delegations: [{ name: 'postgresql', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
    ]
  }
}
resource privateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'soylforms.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}
resource privateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDns
  name: 'forms-network'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: network.id } }
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'soyl-forms-pg-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: 'soyl_migration'
    administratorLoginPassword: databaseOwnerPassword
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
    storage: { storageSizeGB: 32, autoGrow: 'Enabled', type: 'Premium_LRS' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: '${network.id}/subnets/database'
      privateDnsZoneArmResourceId: privateDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [privateDnsLink]
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'soyl_forms'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'soylforms${suffix}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false, publicNetworkAccess: 'Enabled' }
}
resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'soyl-forms-runtime'
  location: location
  tags: tags
}
resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'soyl-forms-migrations'
  location: location
  tags: tags
}
resource runtimePull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, runtimeIdentity.id, 'acr-pull')
  scope: registry
  properties: {
    principalId: runtimeIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}
resource migrationPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, migrationIdentity.id, 'acr-pull')
  scope: registry
  properties: {
    principalId: migrationIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'sfkv${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { name: 'standard', family: 'A' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}
resource operatorSecretManagement 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, operatorObjectId, 'secrets-officer')
  scope: vault
  properties: {
    principalId: operatorObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}
resource runtimeDbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: 'postgresql://soyl_runtime:${databaseRuntimePassword}@${postgres.properties.fullyQualifiedDomainName}:5432/soyl_forms' }
  dependsOn: [operatorSecretManagement]
}
resource ownerDbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-migration-url'
  properties: { value: 'postgresql://soyl_migration:${databaseOwnerPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/soyl_forms' }
  dependsOn: [operatorSecretManagement]
}
resource runtimePasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-runtime-password'
  properties: { value: databaseRuntimePassword }
  dependsOn: [operatorSecretManagement]
}
resource entraSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'entra-client-secret'
  properties: { value: entraClientSecret }
  dependsOn: [operatorSecretManagement]
}
resource cookieSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'auth-session-secret'
  properties: { value: sessionSecret }
  dependsOn: [operatorSecretManagement]
}
var runtimeSecretNames = ['database-url', 'entra-client-secret', 'auth-session-secret']
var migrationSecretNames = ['database-migration-url', 'database-runtime-password']
resource runtimeSecretScopes 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = [for name in runtimeSecretNames: { parent: vault, name: name }]
resource migrationSecretScopes 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = [for name in migrationSecretNames: { parent: vault, name: name }]
resource runtimeSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, index) in runtimeSecretNames: {
  name: guid(runtimeSecretScopes[index].id, runtimeIdentity.id, 'secret-user')
  scope: runtimeSecretScopes[index]
  properties: { principalId: runtimeIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: secretUserRoleId }
  dependsOn: [runtimeDbSecret, entraSecret, cookieSecret]
}]
resource migrationSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, index) in migrationSecretNames: {
  name: guid(migrationSecretScopes[index].id, migrationIdentity.id, 'secret-user')
  scope: migrationSecretScopes[index]
  properties: { principalId: migrationIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: secretUserRoleId }
  dependsOn: [ownerDbSecret, runtimePasswordSecret]
}]
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'soyl-forms-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'soyl-forms-env'
  location: location
  tags: tags
  properties: {
    infrastructureResourceGroup: 'soyl-forms-managed-rg'
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    vnetConfiguration: { infrastructureSubnetId: '${network.id}/subnets/apps', internal: false }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output environmentName string = environment.name
output environmentDomain string = environment.properties.defaultDomain
output runtimeIdentityId string = runtimeIdentity.id
output migrationIdentityId string = migrationIdentity.id
output vaultUri string = vault.properties.vaultUri
output databaseHost string = postgres.properties.fullyQualifiedDomainName
