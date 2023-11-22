import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { ethers } from 'ethers'
import nock from 'nock'

const responseHeaders = [
  'Content-Type',
  'application/json',
  'Connection',
  'close',
  'Vary',
  'Accept-Encoding',
  'Vary',
  'Origin',
]

const calculateIPFSData = (treeData) =>
  treeData.length > 0
    ? {
        merkleRoot: StandardMerkleTree.of(treeData, ['address', 'uint256', 'uint256']).root,
        data: treeData.reduce(
          (data, cur: any) => (
            (data[cur[0]] = {
              amount: cur[1].toString(),
              sharesAmount: cur[2].toString(),
            }),
            data
          ),
          {}
        ),
      }
    : {}

const encode = (types, data: any[]) => ethers.AbiCoder.defaultAbiCoder().encode(types, data)

export function mockChainRPCResponse(
  existingIpfsHash,
  existingMerkleRoot,
  accountData,
  toDistribute,
  sharesToDistribute
): nock.Scope {
  return (
    nock('http://127.0.0.1:8545', { encodedQueryParams: true })
      .persist()
      // chain ID
      .post('/', { method: 'eth_chainId', params: [], id: /^\d+$/, jsonrpc: '2.0' })
      .reply(
        200,
        (_, request) => ({ jsonrpc: '2.0', id: request['id'], result: '0x1' }),
        responseHeaders
      )
      // getDepositsSinceLastUpdate
      .post('/', {
        method: 'eth_call',
        params: [{ to: '0x12363078a932ca28d8ed58532caee579b473edc5', data: '0xaa77eb3a' }, '0x6f'],
        id: /^\d+$/,
        jsonrpc: '2.0',
      })
      .reply(
        200,
        (_, request) => ({
          jsonrpc: '2.0',
          id: request['id'],
          result: encode(
            ['uint256', 'uint256'],
            [BigInt(toDistribute * 1e18), BigInt(sharesToDistribute * 1e18)]
          ),
        }),
        responseHeaders
      )
      // ipfsHash
      .post('/', {
        method: 'eth_call',
        params: [{ to: '0x12363078a932ca28d8ed58532caee579b473edc5', data: '0xc623674f' }, '0x6f'],
        id: /^\d+$/,
        jsonrpc: '2.0',
      })
      .reply(
        200,
        (_, request) => ({
          jsonrpc: '2.0',
          id: request['id'],
          result: encode(['bytes32'], [existingIpfsHash]),
        }),
        responseHeaders
      )
      // merkleRoot
      .post('/', {
        method: 'eth_call',
        params: [{ to: '0x12363078a932ca28d8ed58532caee579b473edc5', data: '0x2eb4a7ab' }, '0x6f'],
        id: /^\d+$/,
        jsonrpc: '2.0',
      })
      .reply(
        200,
        (_, request) => ({
          jsonrpc: '2.0',
          id: request['id'],
          result: encode(['bytes32'], [existingMerkleRoot]),
        }),
        responseHeaders
      )
      // getAccountData
      .post('/', {
        method: 'eth_call',
        params: [{ to: '0x12363078a932ca28d8ed58532caee579b473edc5', data: '0x812af8ec' }, '0x6f'],
        id: /^\d+$/,
        jsonrpc: '2.0',
      })
      .reply(
        200,
        (_, request) => ({
          jsonrpc: '2.0',
          id: request['id'],
          result: encode(['address[]', 'uint256[]', 'uint256[]'], accountData),
        }),
        responseHeaders
      )
  )
}

export function mockIpfsResponse(
  existingTreeData,
  existingIpfsCID,
  newTreeData,
  newIpfsCID
): nock.Scope {
  return nock('http://127.0.0.1:5000/pinata')
    .persist()
    .get(`/ipfs/${existingIpfsCID}`)
    .reply(200, JSON.stringify(calculateIPFSData(existingTreeData)), [
      'Access-Control-Allow-Headers',
      'X-Stream-Output, X-Chunked-Output, X-Content-Length',
      'Access-Control-Expose-Headers',
      'X-Stream-Output, X-Chunked-Output, X-Content-Length',
      'Content-Type',
      'text/plain',
      'Server',
      'go-ipfs/0.9.1',
      'Trailer',
      'X-Stream-Error',
      'Vary',
      'Origin',
      'X-Content-Length',
      '23',
      'X-Stream-Output',
      '1',
      'Date',
      'Tue, 14 Sep 2021 10:41:02 GMT',
      'Transfer-Encoding',
      'chunked',
    ])
    .post('/pinning/pinJSONToIPFS', (body) => {
      const newIpfsData = calculateIPFSData(newTreeData)
      const data = JSON.parse(body.pinataContent)
      const accounts = Object.keys(data.data)

      if (body.pinataOptions.cidVersion != 0) return false
      if (data.merkleRoot != newIpfsData.merkleRoot) return false
      if (Object.keys(newIpfsData.data).length != accounts.length) return false

      for (let i = 0; i < accounts.length; i++) {
        if (JSON.stringify(newIpfsData.data[accounts[i]]) != JSON.stringify(data.data[accounts[i]]))
          return false
      }

      return true
    })
    .reply(
      200,
      {
        IpfsHash: newIpfsCID,
        PinSize: 54,
        Timestamp: '2023-11-21T18:52:21.672Z',
        isDuplicate: true,
      },
      [
        'Access-Control-Allow-Headers',
        'X-Stream-Output, X-Chunked-Output, X-Content-Length',
        'Access-Control-Expose-Headers',
        'X-Stream-Output, X-Chunked-Output, X-Content-Length',
        'Connection',
        'close',
        'Content-Type',
        'application/json',
        'Server',
        'go-ipfs/0.9.1',
        'Trailer',
        'X-Stream-Error',
        'Vary',
        'Origin',
        'X-Chunked-Output',
        '1',
        'Date',
        'Mon, 13 Sep 2021 15:25:10 GMT',
        'Transfer-Encoding',
        'chunked',
      ]
    )
}

export function mockIpfsErrorResponse(ipfsCID): nock.Scope {
  return nock('http://127.0.0.1:5000/gateway').persist().get(`/ipfs/${ipfsCID}`).reply(
    500,
    {
      Message: 'IPFS request error',
      Code: 0,
      Type: 'error',
    },
    [
      'Access-Control-Allow-Headers',
      'X-Stream-Output, X-Chunked-Output, X-Content-Length',
      'Access-Control-Expose-Headers',
      'X-Stream-Output, X-Chunked-Output, X-Content-Length',
      'Content-Type',
      'application/json',
      'Server',
      'go-ipfs/0.9.1',
      'Trailer',
      'X-Stream-Error',
      'Vary',
      'Origin',
      'Date',
      'Tue, 14 Sep 2021 10:41:02 GMT',
      'Transfer-Encoding',
      'chunked',
    ]
  )
}
