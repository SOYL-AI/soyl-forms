param location string = resourceGroup().location
param image string
@secure()
param recipient string
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {name:'soyl-forms-env'}
resource migration 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-migrations'}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {name:'sfkvn4nsiocbpshei'}
resource job 'Microsoft.App/jobs@2024-03-01' = {
  name:'soyl-forms-email-outbox-verification'
  location:location
  tags:{project:'soyl-forms',environment:'verification',temporary:'true'}
  identity:{type:'UserAssigned',userAssignedIdentities:{'${migration.id}':{}}}
  properties:{
    environmentId:environment.id
    workloadProfileName:'Consumption'
    configuration:{
      triggerType:'Manual'
      replicaTimeout:720
      replicaRetryLimit:0
      manualTriggerConfig:{parallelism:1,replicaCompletionCount:1}
      registries:[{server:'soylformsn4nsiocbpshei.azurecr.io',identity:migration.id}]
      secrets:[
        {name:'migration-url',keyVaultUrl:'https://${vault.name}${az.environment().suffixes.keyvaultDns}/secrets/database-migration-url',identity:migration.id}
        {name:'test-recipient',value:recipient}
      ]
    }
    template:{containers:[{
      name:'verify'
      image:image
      command:['node']
      args:['scripts/azure/verify-email-outbox.mjs']
      resources:{cpu:json('0.25'),memory:'0.5Gi'}
      env:[{name:'QA_RUN',value:'true'},{name:'DATABASE_MIGRATION_URL',secretRef:'migration-url'},{name:'EMAIL_TEST_RECIPIENT',secretRef:'test-recipient'}]
    }]}
  }
}
