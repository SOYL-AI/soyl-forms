// Dedicated customer identity directory; deploy only into the isolated Forms resource group.
param directoryName string = 'soylforms'
param displayName string = 'SOYL Forms'
param countryCode string = 'IN'

resource customerDirectory 'Microsoft.AzureActiveDirectory/ciamDirectories@2023-05-17-preview' = {
  name: directoryName
  location: 'Asia Pacific'
  sku: {
    name: 'Standard'
    tier: 'A0'
  }
  properties: {
    createTenantProperties: {
      displayName: displayName
      countryCode: countryCode
    }
  }
}

output tenantId string = customerDirectory.properties.tenantId
output domainName string = customerDirectory.properties.domainName
