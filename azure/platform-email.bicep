param dataLocation string = 'India'
param customDomain string = 'mail.forms.soylai.com'
// Enable only after the domain/SPF/DKIM/DKIM2 verification has completed.
param useCustomDomain bool = false
resource runtime 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {name:'soyl-forms-runtime'}
resource email 'Microsoft.Communication/emailServices@2023-03-31' = {
  name:'soyl-forms-email'
  location:'global'
  tags:{project:'soyl-forms',environment:'staging'}
  properties:{dataLocation:dataLocation}
}
resource domain 'Microsoft.Communication/emailServices/domains@2023-03-31' = {
  parent:email
  name:'AzureManagedDomain'
  location:'global'
  properties:{domainManagement:'AzureManaged',userEngagementTracking:'Disabled'}
}
resource communication 'Microsoft.Communication/communicationServices@2023-03-31' = {
  name:'soyl-forms-communication'
  location:'global'
  tags:{project:'soyl-forms',environment:'staging'}
  properties:{dataLocation:dataLocation,linkedDomains:useCustomDomain ? [customerDomain.id] : [domain.id]}
}
resource customerDomain 'Microsoft.Communication/emailServices/domains@2023-03-31' = {
  parent:email
  name:customDomain
  location:'global'
  properties:{domainManagement:'CustomerManaged',userEngagementTracking:'Disabled'}
}
resource customerSender 'Microsoft.Communication/emailServices/domains/senderUsernames@2023-03-31' = {
  parent:customerDomain
  name:'notifications'
  properties:{username:'notifications',displayName:'SOYL Forms'}
}
// ACS Email's documented Entra authorization requires these two control-plane
// actions. Scope the assignment to this service; exclude keys, deletion and RBAC.
resource senderRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name:guid(resourceGroup().id,'soyl-forms-email-sender')
  properties:{
    roleName:'SOYL Forms email sender'
    description:'Send and check email through the SOYL Forms communication service.'
    type:'CustomRole'
    assignableScopes:[resourceGroup().id]
    permissions:[{actions:['Microsoft.Communication/CommunicationServices/Read','Microsoft.Communication/CommunicationServices/Write'],notActions:[],dataActions:[],notDataActions:[]}]
  }
}
resource senderAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name:guid(communication.id,runtime.id,'email-sender')
  scope:communication
  properties:{principalId:runtime.properties.principalId,principalType:'ServicePrincipal',roleDefinitionId:senderRole.id}
}
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {name:'soyl-forms-logs'}
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name:'soyl-forms-email-delivery'
  scope:communication
  properties:{
    workspaceId:logs.id
    logAnalyticsDestinationType:'Dedicated'
    logs:[{category:'EmailSendMailOperational',enabled:true},{category:'EmailStatusUpdateOperational',enabled:true}]
  }
}
output endpoint string = 'https://${communication.properties.hostName}'
output sender string = useCustomDomain ? 'notifications@${customDomain}' : 'DoNotReply@${domain.properties.mailFromSenderDomain}'
output runtimeClientId string = runtime.properties.clientId
