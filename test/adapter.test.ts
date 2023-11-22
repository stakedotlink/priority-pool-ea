import nock from 'nock'
import * as process from 'process'
import { config } from '../src/config'
import { merkle } from '../src/endpoint'
import { Adapter } from '@chainlink/external-adapter-framework/adapter'
import {
  TestAdapter,
  setEnvVariables,
} from '@chainlink/external-adapter-framework/util/testing-utils'
import { mockChainRPCResponse, mockIpfsErrorResponse, mockIpfsResponse } from './fixtures'

describe('merkle endpoint', () => {
  let spy: jest.SpyInstance
  let testAdapter: TestAdapter
  let oldEnv: NodeJS.ProcessEnv

  const RPC_URL = 'http://127.0.0.1:8545'
  const CHAIN_ID = '1'
  const QUEUE_CONTRACT_ADDRESS = '0x12363078a932ca28d8ed58532caee579b473edc5'
  const PINATA_API_URL = 'http://127.0.0.1:5000/pinata'
  const PINATA_GATEWAY_URL = 'http://127.0.0.1:5000/pinata'
  const PINATA_JWT = 'test'

  beforeAll(async () => {
    oldEnv = JSON.parse(JSON.stringify(process.env))
    process.env['RPC_URL'] = RPC_URL
    process.env['CHAIN_ID'] = CHAIN_ID
    process.env['PRIORITY_POOL_CONTRACT_ADDRESS'] = QUEUE_CONTRACT_ADDRESS
    process.env['PINATA_API_URL'] = PINATA_API_URL
    process.env['PINATA_GATEWAY_URL'] = PINATA_GATEWAY_URL
    process.env['PINATA_JWT'] = PINATA_JWT

    const mockDate = new Date('2022-05-10T16:09:27.193Z')
    spy = jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime())
  })

  beforeEach(async () => {
    const adapter = new Adapter({
      name: 'STAKE.LINK-PRIORITY-POOL',
      endpoints: [merkle],
      defaultEndpoint: merkle.name,
      config,
    })

    await testAdapter?.api.close()
    testAdapter = await TestAdapter.startWithMockedCache(adapter, {
      testAdapter: {} as TestAdapter<never>,
    })
  })

  afterEach(async () => {
    nock.cleanAll()
  })

  afterAll(async () => {
    setEnvVariables(oldEnv)
    await testAdapter.api.close()
    nock.restore()
    nock.cleanAll()
    spy.mockRestore()
  })

  it('existing merkle data', async () => {
    const existingTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(50 * 1e18), BigInt(25 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(30 * 1e18), BigInt(15 * 1e18)],
    ]
    const accountData: any = [
      [
        '0x0000000000000000000000000000000000000000',
        '0x1b6C758535a7a03AA56d6221145112872c963D9D',
        '0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E',
        '0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67',
        '0xccc41e903D40e13bC87eE29413219d33a1161f72',
        '0x65079BB3f085240f1AFCBb3E4188afE93c194b84',
        '0x777E071fE919B6e6b750B5384c92c4d782aD7A66',
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(0),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(400 * 1e18),
        BigInt(0),
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(200 * 1e18),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(0),
        BigInt(300 * 1e18),
      ],
    ]
    const newTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(100 * 1e18), BigInt(50 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(80 * 1e18), BigInt(40 * 1e18)],
      ['0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67', BigInt(300 * 1e18), BigInt(150 * 1e18)],
      ['0xccc41e903D40e13bC87eE29413219d33a1161f72', BigInt(0), BigInt(0)],
      ['0x65079BB3f085240f1AFCBb3E4188afE93c194b84', BigInt(0), BigInt(0)],
      ['0x777E071fE919B6e6b750B5384c92c4d782aD7A66', BigInt(50 * 1e18), BigInt(25 * 1e18)],
    ]
    mockChainRPCResponse(
      '0xF70DA54C680F900AC326B6835AE00DC95CFB78C964D8BFCE17A774DFBC548E37',
      '0xffeea4aa01dd1995af75e548ef9c8b374dd5251706d675c7907364c30d16f9ea',
      accountData,
      450,
      225
    )
    mockIpfsResponse(
      existingTreeData,
      'Qmey3UkJzL4ZKAeQ1XR1BYJBPQfSjjDKgPQv3DFEY3HWSz',
      newTreeData,
      'QmV1N49KT7at9LpNxyyPnCNBLEztMFHvLXoHpdPRoUzGgz'
    )

    const res = await testAdapter.request({ blockNumber: 111 })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.result).toEqual({
      merkleRoot: '0x858c57f12f179519b0a7116d65881a688af0c5a1ee2d65b35fdbaf1cb29dce1b',
      ipfsHash: '0x6310f1189600f807fac771d10706b6665628b99797054447f58f4c8a05971b83',
      amountDistributed: '450000000000000000000',
      sharesDistributed: '225000000000000000000',
    })
  })

  it('no existing merkle data', async () => {
    const accountData: any = [
      [
        '0x0000000000000000000000000000000000000000',
        '0x1b6C758535a7a03AA56d6221145112872c963D9D',
        '0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E',
        '0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67',
        '0xccc41e903D40e13bC87eE29413219d33a1161f72',
        '0x65079BB3f085240f1AFCBb3E4188afE93c194b84',
        '0x777E071fE919B6e6b750B5384c92c4d782aD7A66',
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(0),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(400 * 1e18),
        BigInt(0),
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(400 * 1e18),
        BigInt(200 * 1e18),
        BigInt(0),
        BigInt(0),
        BigInt(300 * 1e18),
      ],
    ]
    const treeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(100 * 1e18), BigInt(50 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(50 * 1e18), BigInt(25 * 1e18)],
      ['0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67', BigInt(200 * 1e18), BigInt(100 * 1e18)],
      ['0xccc41e903D40e13bC87eE29413219d33a1161f72', BigInt(0), BigInt(0)],
      ['0x65079BB3f085240f1AFCBb3E4188afE93c194b84', BigInt(0), BigInt(0)],
      ['0x777E071fE919B6e6b750B5384c92c4d782aD7A66', BigInt(50 * 1e18), BigInt(25 * 1e18)],
    ]
    mockChainRPCResponse(
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      accountData,
      400,
      200
    )
    mockIpfsResponse(
      [],
      'DOES_NOT_EXIST',
      treeData,
      'Qmcv6nq66yt8B5ggLujvd3r7fdb3FncqghwQzWAYA4MWUH'
    )

    const res = await testAdapter.request({ blockNumber: 111 })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.result).toEqual({
      merkleRoot: '0x9fd107aa2a8d1ac4ef3a6e3b6fb43fb2f4dae5e94271bea92e41e795c2dfe44b',
      ipfsHash: '0xd89546279cd9668fcb0e1dde0d2b7f27b1fdbd9ef5ce991006462770e1788b72',
      amountDistributed: '400000000000000000000',
      sharesDistributed: '200000000000000000000',
    })
  })

  it('nothing to distribute', async () => {
    const accountData: any = [
      [
        '0x0000000000000000000000000000000000000000',
        '0x1b6C758535a7a03AA56d6221145112872c963D9D',
        '0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E',
        '0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67',
        '0xccc41e903D40e13bC87eE29413219d33a1161f72',
        '0x65079BB3f085240f1AFCBb3E4188afE93c194b84',
        '0x777E071fE919B6e6b750B5384c92c4d782aD7A66',
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(0),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(400 * 1e18),
        BigInt(0),
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(400 * 1e18),
        BigInt(200 * 1e18),
        BigInt(0),
        BigInt(0),
        BigInt(300 * 1e18),
      ],
    ]
    const treeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(100 * 1e18), BigInt(50 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(50 * 1e18), BigInt(25 * 1e18)],
      ['0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67', BigInt(200 * 1e18), BigInt(100 * 1e18)],
      ['0xccc41e903D40e13bC87eE29413219d33a1161f72', BigInt(0), BigInt(0)],
      ['0x65079BB3f085240f1AFCBb3E4188afE93c194b84', BigInt(0), BigInt(0)],
      ['0x777E071fE919B6e6b750B5384c92c4d782aD7A66', BigInt(50 * 1e18), BigInt(25 * 1e18)],
    ]
    mockChainRPCResponse(
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      accountData,
      0.1,
      0.05
    )
    mockIpfsResponse(
      [],
      'DOES_NOT_EXIST',
      treeData,
      'Qmcv6nq66yt8B5ggLujvd3r7fdb3FncqghwQzWAYA4MWUH'
    )

    const res = await testAdapter.request({ blockNumber: 111 })

    expect(res.statusCode).toBe(500)
    expect(res.json().errorMessage).toEqual('Nothing to distribute')
  })

  it('mismatched merkle root', async () => {
    const existingTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(50 * 1e18), BigInt(25 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(40 * 1e18), BigInt(15 * 1e18)],
    ]
    const accountData: any = [
      [
        '0x0000000000000000000000000000000000000000',
        '0x1b6C758535a7a03AA56d6221145112872c963D9D',
        '0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E',
        '0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67',
        '0xccc41e903D40e13bC87eE29413219d33a1161f72',
        '0x65079BB3f085240f1AFCBb3E4188afE93c194b84',
        '0x777E071fE919B6e6b750B5384c92c4d782aD7A66',
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(0),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(400 * 1e18),
        BigInt(0),
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(200 * 1e18),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(0),
        BigInt(300 * 1e18),
      ],
    ]
    const newTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(100 * 1e18), BigInt(50 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(90 * 1e18), BigInt(45 * 1e18)],
      ['0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67', BigInt(300 * 1e18), BigInt(150 * 1e18)],
      ['0xccc41e903D40e13bC87eE29413219d33a1161f72', BigInt(0), BigInt(0)],
      ['0x65079BB3f085240f1AFCBb3E4188afE93c194b84', BigInt(0), BigInt(0)],
      ['0x777E071fE919B6e6b750B5384c92c4d782aD7A66', BigInt(50 * 1e18), BigInt(25 * 1e18)],
    ]
    mockChainRPCResponse(
      '0xF70DA54C680F900AC326B6835AE00DC95CFB78C964D8BFCE17A774DFBC548E37',
      '0xffeea4aa01dd1995af75e548ef9c8b374dd5251706d675c7907364c30d16f9ea',
      accountData,
      450,
      225
    )
    mockIpfsResponse(
      existingTreeData,
      'Qmey3UkJzL4ZKAeQ1XR1BYJBPQfSjjDKgPQv3DFEY3HWSz',
      newTreeData,
      'QmV1N49KT7at9LpNxyyPnCNBLEztMFHvLXoHpdPRoUzGgz'
    )

    const res = await testAdapter.request({ blockNumber: 111 })

    expect(res.statusCode).toBe(500)
    expect(res.json().errorMessage).toEqual('Merkle roots do not match')
  })

  it('IPFS request error', async () => {
    const existingTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(50 * 1e18), BigInt(25 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(30 * 1e18), BigInt(15 * 1e18)],
    ]
    const accountData: any = [
      [
        '0x0000000000000000000000000000000000000000',
        '0x1b6C758535a7a03AA56d6221145112872c963D9D',
        '0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E',
        '0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67',
        '0xccc41e903D40e13bC87eE29413219d33a1161f72',
        '0x65079BB3f085240f1AFCBb3E4188afE93c194b84',
        '0x777E071fE919B6e6b750B5384c92c4d782aD7A66',
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(0),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(400 * 1e18),
        BigInt(0),
      ],
      [
        BigInt(0),
        BigInt(100 * 1e18),
        BigInt(200 * 1e18),
        BigInt(300 * 1e18),
        BigInt(0),
        BigInt(0),
        BigInt(300 * 1e18),
      ],
    ]
    const newTreeData = [
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(0)],
      ['0x1b6C758535a7a03AA56d6221145112872c963D9D', BigInt(100 * 1e18), BigInt(50 * 1e18)],
      ['0x2D4227b62e4405D1979a69cD3f811b3c3C0b903E', BigInt(80 * 1e18), BigInt(40 * 1e18)],
      ['0x555f27995D7BB56c989d7C1cA4e5e03e930ecA67', BigInt(300 * 1e18), BigInt(150 * 1e18)],
      ['0xccc41e903D40e13bC87eE29413219d33a1161f72', BigInt(0), BigInt(0)],
      ['0x65079BB3f085240f1AFCBb3E4188afE93c194b84', BigInt(0), BigInt(0)],
      ['0x777E071fE919B6e6b750B5384c92c4d782aD7A66', BigInt(50 * 1e18), BigInt(25 * 1e18)],
    ]
    mockChainRPCResponse(
      '0xF70DA54C680F900AC326B6835AE00DC95CFB78C964D8BFCE17A774DFBC548E37',
      '0xffeea4aa01dd1995af75e548ef9c8b374dd5251706d675c7907364c30d16f9ea',
      accountData,
      450,
      225
    )
    mockIpfsErrorResponse('Qmey3UkJzL4ZKAeQ1XR1BYJBPQfSjjDKgPQv3DFEY3HWSz')

    const res = await testAdapter.request({ blockNumber: 111 })

    expect(res.statusCode).toBe(502)
  })
})
