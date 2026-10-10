param location string = resourceGroup().location
param image string
param registryName string = 'soylformsn4nsiocbpshei'
param vaultName string = 'sfkvn4nsiocbpshei'
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {name:'soyl-forms-env'}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {name:registryName}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {name:vaultName}
resource cronSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {parent:vault,name:'cron-secret'}
resource scheduler 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name:'soyl-forms-scheduler'
  location:location
  tags:{project:'soyl-forms',environment:'staging'}
}
resource pull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(registry.id,scheduler.id,'acr-pull')
  scope:registry
  properties:{principalId:scheduler.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','7f951dda-4ed3-4680-a7ca-43fe172d538d')}
}
resource credential 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(cronSecret.id,scheduler.id,'secret-user')
  scope:cronSecret
  properties:{principalId:scheduler.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','4633458b-17de-408a-b874-0445c86b69e6')}
}
var schedules=[{name:'outbox',cron:'* * * * *'},{name:'cleanup',cron:'7 * * * *'}]
resource jobs 'Microsoft.App/jobs@2024-03-01' = [for schedule in schedules: {
  name:'soyl-forms-${schedule.name}'
  location:location
  tags:{project:'soyl-forms',environment:'staging'}
  identity:{type:'UserAssigned',userAssignedIdentities:{'${scheduler.id}':{}}}
  properties:{
    environmentId:environment.id
    workloadProfileName:'Consumption'
    configuration:{
      triggerType:'Schedule'
      replicaTimeout:120
      replicaRetryLimit:1
      scheduleTriggerConfig:{cronExpression:schedule.cron,parallelism:1,replicaCompletionCount:1}
      registries:[{server:registry.properties.loginServer,identity:scheduler.id}]
      secrets:[{name:'cron-secret',keyVaultUrl:'${vault.properties.vaultUri}secrets/cron-secret',identity:scheduler.id}]
    }
    template:{containers:[{
      name:schedule.name
      image:image
      command:['node','scripts/azure/run-job.mjs',schedule.name]
      resources:{cpu:json('0.25'),memory:'0.5Gi'}
      env:[{name:'APP_ORIGIN',value:'https://soyl-forms-web.${environment.properties.defaultDomain}'},{name:'CRON_SECRET',secretRef:'cron-secret'}]
    }]}
  }
  dependsOn:[pull,credential]
}]
