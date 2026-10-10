param location string = resourceGroup().location
resource database 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {name:'soyl-forms-pg-n4nsiocbpshei'}
resource web 'Microsoft.App/containerApps@2024-03-01' existing = {name:'soyl-forms-web'}
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {name:'soyl-forms-logs'}
resource operators 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name:'soyl-forms-operators'
  location:'global'
  tags:{project:'soyl-forms',environment:'staging'}
  properties:{
    groupShortName:'SOYLForms'
    enabled:true
    armRoleReceivers:[{name:'Subscription owners',roleId:'8e3af657-a8ff-443c-a75c-2fe8c4bcb635',useCommonAlertSchema:true}]
  }
}
var thresholds=[
  {name:'database-cpu',scope:database.id,namespace:'Microsoft.DBforPostgreSQL/flexibleServers',metric:'cpu_percent',aggregation:'Average',threshold:70,window:'PT15M',dimensions:[]}
  {name:'database-storage',scope:database.id,namespace:'Microsoft.DBforPostgreSQL/flexibleServers',metric:'storage_percent',aggregation:'Maximum',threshold:70,window:'PT5M',dimensions:[]}
  {name:'database-connections',scope:database.id,namespace:'Microsoft.DBforPostgreSQL/flexibleServers',metric:'active_connections',aggregation:'Maximum',threshold:25,window:'PT5M',dimensions:[]}
  {name:'application-cpu',scope:web.id,namespace:'Microsoft.App/containerApps',metric:'CpuPercentage',aggregation:'Average',threshold:70,window:'PT15M',dimensions:[]}
  {name:'application-memory',scope:web.id,namespace:'Microsoft.App/containerApps',metric:'MemoryPercentage',aggregation:'Average',threshold:80,window:'PT15M',dimensions:[]}
  // This platform metric is the average in milliseconds; it is not a p95 SLO.
  {name:'application-response-time',scope:web.id,namespace:'Microsoft.App/containerApps',metric:'ResponseTime',aggregation:'Average',threshold:1000,window:'PT15M',dimensions:[]}
  {name:'application-server-errors',scope:web.id,namespace:'Microsoft.App/containerApps',metric:'Requests',aggregation:'Total',threshold:5,window:'PT5M',dimensions:[{name:'statusCodeCategory',operator:'Include',values:['5xx']}]}
]
resource metrics 'Microsoft.Insights/metricAlerts@2018-03-01' = [for limit in thresholds: {
  name:'soyl-forms-${limit.name}'
  location:'global'
  tags:{project:'soyl-forms',environment:'staging'}
  properties:{
    description:'SOYL Forms staging ${limit.name}; investigate before increasing resource limits. See docs/23_azure_platform_staging.md.'
    severity:2
    enabled:true
    autoMitigate:true
    scopes:[limit.scope]
    evaluationFrequency:'PT1M'
    windowSize:limit.window
    criteria:{
      'odata.type':'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf:[{name:limit.name,criterionType:'StaticThresholdCriterion',metricNamespace:limit.namespace,metricName:limit.metric,timeAggregation:limit.aggregation,operator:'GreaterThan',threshold:limit.threshold,dimensions:limit.dimensions}]
    }
    actions:[{actionGroupId:operators.id}]
  }
}]
var failures='''
ContainerAppConsoleLogs_CL
| extend message=parse_json(Log_s)
| where tostring(message.event) in ('scheduled_job_failed','azure_outbox_processing_failed','azure_outbox_lease_lost','account_deletion_retry')
    or (tostring(message.event)=='scheduled_job_completed' and (tolong(message.result.failed)>0 or tolong(message.result.queue.failed24h)>0 or tolong(message.result.queue.oldestPendingSeconds)>300 or tolong(message.result.queue.oldestDeletionSeconds)>86400))
| project TimeGenerated
'''
var heartbeat='''
ContainerAppConsoleLogs_CL
| extend message=parse_json(Log_s)
| where tostring(message.event)=='scheduled_job_completed' and tostring(message.job)=='outbox'
| summarize heartbeats=count()
| where heartbeats==0
'''
var queries=[
  {name:'worker-failure-or-backlog',query:failures,description:'Worker failure, terminal delivery failure, outbox older than five minutes or account deletion older than one day.'}
  {name:'outbox-heartbeat-missing',query:heartbeat,description:'No successful outbox job log in five minutes. Check scheduler executions and Log Analytics ingestion/daily cap.'}
]
resource workerAlerts 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = [for query in queries: {
  name:'soyl-forms-${query.name}'
  location:location
  kind:'LogAlert'
  tags:{project:'soyl-forms',environment:'staging'}
  properties:{
    displayName:'SOYL Forms ${query.name}'
    description:query.description
    enabled:true
    severity:2
    autoMitigate:true
    evaluationFrequency:'PT5M'
    windowSize:'PT5M'
    scopes:[logs.id]
    skipQueryValidation:false
    criteria:{allOf:[{query:query.query,timeAggregation:'Count',operator:'GreaterThan',threshold:0,failingPeriods:{numberOfEvaluationPeriods:1,minFailingPeriodsToAlert:1}}]}
    actions:{actionGroups:[operators.id]}
  }
}]
