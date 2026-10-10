param location string = resourceGroup().location
param image string
param registryServer string
param vaultUri string
param integrationSettings array
param tenantId string = '47f0c7e0-77a5-4ae0-b3b4-b9b48269d014'
param clientId string = 'bccc18ff-25c7-426e-827f-1ff928f98de9'
param emailEndpoint string = 'https://soyl-forms-communication.india.communication.azure.com'
param appOrigin string = ''
@allowed(['staging','production'])
param deploymentStage string = 'staging'

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = { name: 'soyl-forms-env' }
resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: 'soyl-forms-runtime' }
var resolvedAppOrigin = empty(appOrigin) ? 'https://soyl-forms-web.${environment.properties.defaultDomain}' : appOrigin
var integrationSecrets=[for setting in integrationSettings: {name:setting.secretName,keyVaultUrl:'${vaultUri}secrets/${setting.secretName}',identity:runtimeIdentity.id}]
var integrationEnv=[for setting in integrationSettings: {name:setting.envName,secretRef:setting.secretName}]
resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'soyl-forms-web'
  location: location
  tags: { project: 'soyl-forms', environment: deploymentStage }
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${runtimeIdentity.id}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, allowInsecure: false, targetPort: 3000, transport: 'auto' }
      registries: [{ server: registryServer, identity: runtimeIdentity.id }]
      secrets: concat([
        { name: 'database-url', keyVaultUrl: '${vaultUri}secrets/database-url', identity: runtimeIdentity.id }
        { name: 'entra-client-secret', keyVaultUrl: '${vaultUri}secrets/entra-client-secret', identity: runtimeIdentity.id }
        { name: 'session-secret', keyVaultUrl: '${vaultUri}secrets/auth-session-secret', identity: runtimeIdentity.id }
      ],integrationSecrets)
    }
    template: {
      // B1ms connection budget: three connections per web process, at most three replicas.
      scale: { minReplicas: 1, maxReplicas: 3, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '20' } } }] }
      containers: [{
        name: 'web'
        image: image
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat([
          { name: 'TRUSTED_PROXY', value: 'azure' }
          { name: 'APP_ORIGIN', value: resolvedAppOrigin }
          { name: 'ENTRA_AUTH_PROOF_ENABLED', value: 'true' }
          { name: 'ENTRA_TENANT_ID', value: tenantId }
          { name: 'ENTRA_CLIENT_ID', value: clientId }
          { name: 'ENTRA_APP_ORIGIN', value: resolvedAppOrigin }
          { name: 'DATABASE_URL', secretRef: 'database-url' }
          { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
          { name: 'AUTH_SESSION_SECRET', secretRef: 'session-secret' }
        ],integrationEnv,empty(emailEndpoint) ? [] : [
          {name:'EMAIL_PROVIDER',value:'azure'}
          {name:'AZURE_EMAIL_ENDPOINT',value:emailEndpoint}
          {name:'AZURE_CLIENT_ID',value:runtimeIdentity.properties.clientId}
        ])
        probes: [
          { type: 'Startup', httpGet: { path: '/api/health/live', port: 3000 }, initialDelaySeconds: 1, periodSeconds: 6, timeoutSeconds: 2, failureThreshold: 10 }
          { type: 'Liveness', httpGet: { path: '/api/health/live', port: 3000 }, initialDelaySeconds: 10, periodSeconds: 30, timeoutSeconds: 2, failureThreshold: 3 }
          { type: 'Readiness', httpGet: { path: '/api/health/ready', port: 3000 }, initialDelaySeconds: 3, periodSeconds: 30, timeoutSeconds: 6, failureThreshold: 3 }
        ]
      }]
    }
  }
}
output origin string = resolvedAppOrigin
