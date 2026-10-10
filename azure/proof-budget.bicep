targetScope = 'subscription'

param startDate string = '2026-10-01'
param monthlyAmount int = 7000

// Billing currency verified through Cost Management: INR. Include managed networking costs.
resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'soyl-forms-lean-launch'
  properties: {
    amount: monthlyAmount
    category: 'Cost'
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate, endDate: dateTimeAdd(startDate, 'P1Y') }
    filter: {
      dimensions: { name: 'ResourceGroupName', operator: 'In', values: ['soyl-forms-staging-rg', 'soyl-forms-managed-rg'] }
    }
    notifications: {
      Actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: [], contactRoles: ['Owner'] }
      Actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: [], contactRoles: ['Owner'] }
      Actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: [], contactRoles: ['Owner'] }
      Forecast100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Forecasted', contactEmails: [], contactRoles: ['Owner'] }
    }
  }
}
