param location string = resourceGroup().location
param image string
@allowed(['staging-acceptance','check-restored-database'])
param scriptName string = 'staging-acceptance'
@allowed(['--smoke','--load','--hot'])
param mode string = '--smoke'
param jobName string = 'soyl-forms-verification'
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {name:'soyl-forms-env'}
resource runtime 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-runtime'}
resource migration 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-migrations'}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {name:'sfkvn4nsiocbpshei'}
var vaultUri='https://${vault.name}${az.environment().suffixes.keyvaultDns}/'
var storage=['r2-account-id','r2-access-key-id','r2-secret-access-key','r2-bucket-name']
var storageSecrets=[for name in storage:{name:name,keyVaultUrl:'${vaultUri}secrets/${name}',identity:runtime.id}]
var storageEnv=[for name in storage:{name:toUpper(replace(name,'-','_')),secretRef:name}]
resource job 'Microsoft.App/jobs@2024-03-01' = {
  name:jobName
  location:location
  tags:{project:'soyl-forms',environment:'verification',temporary:'true'}
  // Verification alone uses both identities. The web app never receives migration credentials.
  identity:{type:'UserAssigned',userAssignedIdentities:{'${runtime.id}':{},'${migration.id}':{}}}
  properties:{
    environmentId:environment.id
    workloadProfileName:'Consumption'
    configuration:{
      triggerType:'Manual'
      replicaTimeout:3600
      replicaRetryLimit:0
      manualTriggerConfig:{parallelism:1,replicaCompletionCount:1}
      registries:[{server:'soylformsn4nsiocbpshei.azurecr.io',identity:migration.id}]
      secrets:concat([
        {name:'migration-url',keyVaultUrl:'${vaultUri}secrets/database-migration-url',identity:migration.id}
        {name:'runtime-password',keyVaultUrl:'${vaultUri}secrets/database-runtime-password',identity:migration.id}
      ],storageSecrets)
    }
    template:{containers:[{
      name:'verify'
      image:image
      command:['node']
      args:['scripts/azure/${scriptName}.mjs',mode]
      resources:{cpu:json('0.5'),memory:'1Gi'}
      env:concat([
        {name:'APP_ORIGIN',value:'https://soyl-forms-web.${environment.properties.defaultDomain}'}
        {name:'QA_RUN',value:'true'}
        {name:'DATABASE_MIGRATION_URL',secretRef:'migration-url'}
        {name:'DATABASE_RUNTIME_PASSWORD',secretRef:'runtime-password'}
      ],storageEnv)
    }]}
  }
}
