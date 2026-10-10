param location string = resourceGroup().location
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {name:'soylformsn4nsiocbpshei'}
resource web 'Microsoft.App/containerApps@2024-03-01' existing = {name:'soyl-forms-web'}
resource job 'Microsoft.App/jobs@2024-03-01' existing = {name:'soyl-forms-migrate'}
resource release 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name:'soyl-forms-staging-release'
  location:location
  tags:{project:'soyl-forms',environment:'staging'}
}
resource github 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent:release
  name:'github-staging-environment'
  properties:{issuer:'https://token.actions.githubusercontent.com',subject:'repo:SOYL-AI/soyl-forms:environment:azure-staging',audiences:['api://AzureADTokenExchange']}
}
resource push 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(registry.id,release.id,'acr-push')
  scope:registry
  properties:{principalId:release.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','8311e382-0749-4cb8-b61a-304f252e45ec')}
}
resource webRelease 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(web.id,release.id,'release')
  scope:web
  properties:{principalId:release.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','b24988ac-6180-42a0-ab88-20f7382dd24c')}
}
resource migrationRelease 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(job.id,release.id,'release')
  scope:job
  properties:{principalId:release.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','b24988ac-6180-42a0-ab88-20f7382dd24c')}
}
output clientId string = release.properties.clientId
