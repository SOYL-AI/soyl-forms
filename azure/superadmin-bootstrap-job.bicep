param location string = resourceGroup().location
param image string
@secure()
param email string
param applyGrant bool = false
param expectedUserId string = ''
param expectedObjectId string = ''
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {name:'soyl-forms-env'}
resource migration 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-migrations'}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {name:'sfkvn4nsiocbpshei'}
var vaultUri='https://${vault.name}${az.environment().suffixes.keyvaultDns}/'
resource job 'Microsoft.App/jobs@2024-03-01' = {
  name:'soyl-forms-admin-bootstrap'
  location:location
  tags:{project:'soyl-forms',environment:'bootstrap',temporary:'true'}
  identity:{type:'UserAssigned',userAssignedIdentities:{'${migration.id}':{}}}
  properties:{
    environmentId:environment.id
    workloadProfileName:'Consumption'
    configuration:{
      triggerType:'Manual'
      replicaTimeout:120
      replicaRetryLimit:0
      manualTriggerConfig:{parallelism:1,replicaCompletionCount:1}
      registries:[{server:'soylformsn4nsiocbpshei.azurecr.io',identity:migration.id}]
      secrets:[
        {name:'migration-url',keyVaultUrl:'${vaultUri}secrets/database-migration-url',identity:migration.id}
        {name:'runtime-password',keyVaultUrl:'${vaultUri}secrets/database-runtime-password',identity:migration.id}
        {name:'target-email',value:email}
      ]
    }
    template:{containers:[{
      name:'bootstrap'
      image:image
      command:['node']
      args:['--input-type=module','--eval',loadTextContent('../scripts/azure/bootstrap-superadmin.mjs')]
      resources:{cpu:json('0.25'),memory:'0.5Gi'}
      env:[
        {name:'DATABASE_MIGRATION_URL',secretRef:'migration-url'}
        {name:'DATABASE_RUNTIME_PASSWORD',secretRef:'runtime-password'}
        {name:'SUPERADMIN_EMAIL',secretRef:'target-email'}
        {name:'SUPERADMIN_APPLY',value:applyGrant ? 'true' : 'false'}
        {name:'SUPERADMIN_EXPECTED_USER_ID',value:expectedUserId}
        {name:'SUPERADMIN_EXPECTED_OBJECT_ID',value:expectedObjectId}
      ]
    }]}
  }
}
