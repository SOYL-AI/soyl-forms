param location string = resourceGroup().location
param image string
param registryServer string
param vaultUri string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = { name: 'soyl-forms-env' }
resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: 'soyl-forms-migrations' }
resource migrationJob 'Microsoft.App/jobs@2024-03-01' = {
  name: 'soyl-forms-migrate'
  location: location
  tags: { project: 'soyl-forms', environment: 'auth-proof' }
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${migrationIdentity.id}': {} } }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [{ server: registryServer, identity: migrationIdentity.id }]
      secrets: [
        { name: 'migration-url', keyVaultUrl: '${vaultUri}secrets/database-migration-url', identity: migrationIdentity.id }
        { name: 'runtime-password', keyVaultUrl: '${vaultUri}secrets/database-runtime-password', identity: migrationIdentity.id }
      ]
    }
    template: {
      containers: [{
        name: 'migrate'
        image: image
        command: ['node']
        args: ['scripts/azure/bootstrap-database.mjs']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'DATABASE_MIGRATION_URL', secretRef: 'migration-url' }
          { name: 'DATABASE_RUNTIME_PASSWORD', secretRef: 'runtime-password' }
        ]
      }]
    }
  }
}
