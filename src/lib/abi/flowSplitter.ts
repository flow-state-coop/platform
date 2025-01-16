export const flowSplitterAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addPoolAdmin",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      { name: "_admin", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createPool",
    inputs: [
      {
        name: "_poolSuperToken",
        type: "address",
        internalType: "contract ISuperToken",
      },
      {
        name: "_poolConfig",
        type: "tuple",
        internalType: "struct PoolConfig",
        components: [
          {
            name: "transferabilityForUnitsOwner",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "distributionFromAnyAddress",
            type: "bool",
            internalType: "bool",
          },
        ],
      },
      {
        name: "_erc20Metadata",
        type: "tuple",
        internalType: "struct PoolERC20Metadata",
        components: [
          { name: "name", type: "string", internalType: "string" },
          { name: "symbol", type: "string", internalType: "string" },
          { name: "decimals", type: "uint8", internalType: "uint8" },
        ],
      },
      {
        name: "_members",
        type: "tuple[]",
        internalType: "struct IFlowSplitter.Member[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "units", type: "uint128", internalType: "uint128" },
        ],
      },
      { name: "_admins", type: "address[]", internalType: "address[]" },
      { name: "_metadata", type: "string", internalType: "string" },
    ],
    outputs: [
      {
        name: "gdaPool",
        type: "address",
        internalType: "contract ISuperfluidPool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPoolByAdminRole",
    inputs: [{ name: "_adminRole", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      {
        name: "pool",
        type: "tuple",
        internalType: "struct IFlowSplitter.Pool",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "poolAddress", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "metadata", type: "string", internalType: "string" },
          { name: "adminRole", type: "bytes32", internalType: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolById",
    inputs: [{ name: "_poolId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "pool",
        type: "tuple",
        internalType: "struct IFlowSplitter.Pool",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "poolAddress", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "metadata", type: "string", internalType: "string" },
          { name: "adminRole", type: "bytes32", internalType: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolNameById",
    inputs: [{ name: "_poolId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "name", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolSymbolById",
    inputs: [{ name: "_poolId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "symbol", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoleAdmin",
    inputs: [{ name: "role", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "hasRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isPoolAdmin",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      { name: "_account", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolCounter",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proxiableUUID",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "removePoolAdmin",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      { name: "_admin", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "renounceRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRole",
    inputs: [
      { name: "role", type: "bytes32", internalType: "bytes32" },
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [{ name: "interfaceId", type: "bytes4", internalType: "bytes4" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "newOwner", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateMembersUnits",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      {
        name: "_members",
        type: "tuple[]",
        internalType: "struct IFlowSplitter.Member[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "units", type: "uint128", internalType: "uint128" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePool",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      {
        name: "_members",
        type: "tuple[]",
        internalType: "struct IFlowSplitter.Member[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "units", type: "uint128", internalType: "uint128" },
        ],
      },
      {
        name: "_admins",
        type: "tuple[]",
        internalType: "struct IFlowSplitter.Admin[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IFlowSplitter.AdminStatus",
          },
        ],
      },
      { name: "_metadata", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePoolAdmins",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      {
        name: "_admins",
        type: "tuple[]",
        internalType: "struct IFlowSplitter.Admin[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IFlowSplitter.AdminStatus",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePoolMetadata",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      { name: "_metadata", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "upgradeTo",
    inputs: [
      { name: "newImplementation", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      { name: "newImplementation", type: "address", internalType: "address" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "event",
    name: "AdminChanged",
    inputs: [
      {
        name: "previousAdmin",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "newAdmin",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BeaconUpgraded",
    inputs: [
      {
        name: "beacon",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [
      { name: "version", type: "uint8", indexed: false, internalType: "uint8" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolCreated",
    inputs: [
      {
        name: "poolId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "poolAddress",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "token",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "metadata",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolMetadataUpdated",
    inputs: [
      {
        name: "poolId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "metadata",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleAdminChanged",
    inputs: [
      { name: "role", type: "bytes32", indexed: true, internalType: "bytes32" },
      {
        name: "previousAdminRole",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "newAdminRole",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleGranted",
    inputs: [
      { name: "role", type: "bytes32", indexed: true, internalType: "bytes32" },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleRevoked",
    inputs: [
      { name: "role", type: "bytes32", indexed: true, internalType: "bytes32" },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "NOT_POOL_ADMIN", inputs: [] },
  { type: "error", name: "ZERO_ADDRESS", inputs: [] },
] as const;
