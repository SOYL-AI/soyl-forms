param location string = resourceGroup().location
param image string
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {name:'soyl-forms-env'}
resource runtime 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-runtime'}
resource communication 'Microsoft.Communication/communicationServices@2023-03-31' existing = {name:'soyl-forms-communication'}
resource domain 'Microsoft.Communication/emailServices/domains@2023-03-31' existing = {name:'soyl-forms-email/AzureManagedDomain'}
resource job 'Microsoft.App/jobs@2024-03-01' = {
  name:'soyl-forms-email-verification'
  location:location
  tags:{project:'soyl-forms',environment:'verification',temporary:'true'}
  identity:{type:'UserAssigned',userAssignedIdentities:{'${runtime.id}':{}}}
  properties:{
    environmentId:environment.id
    workloadProfileName:'Consumption'
    configuration:{
      triggerType:'Manual'
      replicaTimeout:180
      replicaRetryLimit:0
      manualTriggerConfig:{parallelism:1,replicaCompletionCount:1}
      registries:[{server:'soylformsn4nsiocbpshei.azurecr.io',identity:runtime.id}]
    }
    template:{containers:[{
      name:'verify'
      image:image
      resources:{cpu:json('0.25'),memory:'0.5Gi'}
      env:[
        {name:'EMAIL_PROVIDER',value:'azure'}
        {name:'AZURE_EMAIL_ENDPOINT',value:'https://${communication.properties.hostName}'}
        {name:'AZURE_CLIENT_ID',value:runtime.properties.clientId}
        {name:'EMAIL_FROM',value:'DoNotReply@${domain.properties.mailFromSenderDomain}'}
      ]
    }]}
  }
}
