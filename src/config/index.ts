import { AdapterConfig } from '@chainlink/external-adapter-framework/config'

export const config = new AdapterConfig({
  RPC_URL: {
    description: 'RPC URL for current network',
    type: 'string',
    required: true,
  },
  CHAIN_ID: {
    description: 'Chain ID for current network',
    type: 'number',
    required: true,
  },
  PRIORITY_POOL_CONTRACT_ADDRESS: {
    description: 'Address of the priority pool',
    type: 'string',
    required: true,
  },
  PINATA_API_URL: {
    description: 'API URL for Pinata',
    type: 'string',
    required: true,
  },
  PINATA_JWT: {
    description: 'JWT for Pinata API',
    type: 'string',
    required: true,
  },
  PINATA_GATEWAY_URL: {
    description: 'Gateway URL for Pinata',
    type: 'string',
    required: true,
  },
})
