@secure()
param settings object
param vaultName string = 'sfkvn4nsiocbpshei'
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {name:vaultName}
resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-runtime'}
resource secrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [for entry in items(settings): {
  parent:vault
  name:entry.key
  properties:{value:entry.value.value}
}]
resource access 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (entry,index) in items(settings): {
  name:guid(secrets[index].id,runtimeIdentity.id,'secret-user')
  scope:secrets[index]
  properties:{principalId:runtimeIdentity.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','4633458b-17de-408a-b874-0445c86b69e6')}
}]
