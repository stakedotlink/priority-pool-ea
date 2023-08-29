export const PriorityPoolABI = [
  'function getAccountData() external view returns (address[] memory,uint256[] memory,uint256[] memory)',
  'function ipfsHash() external view returns (bytes32)',
  'function merkleRoot() external view returns (bytes32)',
  'function getDepositsSinceLastUpdate() external view returns (uint256,uint256)',
]
