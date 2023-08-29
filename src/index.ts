import { expose, ServerInstance } from '@chainlink/external-adapter-framework'
import { Adapter } from '@chainlink/external-adapter-framework/adapter'
import { merkle } from './endpoint'
import { config } from './config'

export const adapter = new Adapter({
  defaultEndpoint: merkle.name,
  name: 'STAKE.LINK-PRIORITY-POOL',
  config,
  endpoints: [merkle],
})

export const server = (): Promise<ServerInstance | undefined> => expose(adapter)
