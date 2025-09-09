export const flowCouncilAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_superToken",
        type: "address",
        internalType: "contract ISuperToken",
      },
      { name: "_admin", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "RECIPIENT_MANAGER_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "VOTER_MANAGER_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addRecipient",
    inputs: [
      { name: "_account", type: "address", internalType: "address" },
      { name: "_metadata", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addVoter",
    inputs: [
      { name: "_account", type: "address", internalType: "address" },
      { name: "_votingPower", type: "uint96", internalType: "uint96" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "distributionPool",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "contract ISuperfluidPool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "editVoter",
    inputs: [
      { name: "_account", type: "address", internalType: "address" },
      { name: "_votingPower", type: "uint96", internalType: "uint96" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getRecipient",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "recipient",
        type: "tuple",
        internalType: "struct IFlowCouncil.Recipient",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "votes", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
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
    name: "getVoter",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "voter",
        type: "tuple",
        internalType: "struct IFlowCouncil.Voter",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "votingPower", type: "uint96", internalType: "uint96" },
          {
            name: "votes",
            type: "tuple[]",
            internalType: "struct IFlowCouncil.CurrentVote[]",
            components: [
              { name: "recipientId", type: "uint160", internalType: "uint160" },
              { name: "amount", type: "uint96", internalType: "uint96" },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct IFlowCouncil.Vote[]",
        components: [
          { name: "recipient", type: "address", internalType: "address" },
          { name: "amount", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
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
    name: "maxVotingSpread",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recipientById",
    inputs: [{ name: "", type: "uint160", internalType: "uint160" }],
    outputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "votes", type: "uint96", internalType: "uint96" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recipientIdByAddress",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint160", internalType: "uint160" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recipients",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "votes", type: "uint96", internalType: "uint96" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "removeRecipient",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeVoter",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
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
    name: "setMaxVotingSpread",
    inputs: [
      { name: "_maxVotingSpread", type: "uint8", internalType: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "superToken",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "contract ISuperToken" },
    ],
    stateMutability: "view",
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
    name: "updateManagers",
    inputs: [
      {
        name: "_managers",
        type: "tuple[]",
        internalType: "struct IFlowCouncil.Manager[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "role", type: "bytes32", internalType: "bytes32" },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IFlowCouncil.Status",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateRecipients",
    inputs: [
      {
        name: "_recipients",
        type: "tuple[]",
        internalType: "struct IFlowCouncil.UpdatingAccount[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IFlowCouncil.Status",
          },
        ],
      },
      { name: "_metadata", type: "string[]", internalType: "string[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateVoters",
    inputs: [
      {
        name: "_voters",
        type: "tuple[]",
        internalType: "struct IFlowCouncil.Voter[]",
        components: [
          { name: "account", type: "address", internalType: "address" },
          { name: "votingPower", type: "uint96", internalType: "uint96" },
          {
            name: "votes",
            type: "tuple[]",
            internalType: "struct IFlowCouncil.CurrentVote[]",
            components: [
              { name: "recipientId", type: "uint160", internalType: "uint160" },
              { name: "amount", type: "uint96", internalType: "uint96" },
            ],
          },
        ],
      },
      { name: "_maxVotingSpread", type: "uint8", internalType: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vote",
    inputs: [
      {
        name: "_votes",
        type: "tuple[]",
        internalType: "struct IFlowCouncil.Vote[]",
        components: [
          { name: "recipient", type: "address", internalType: "address" },
          { name: "amount", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "voters",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [
      { name: "account", type: "address", internalType: "address" },
      { name: "votingPower", type: "uint96", internalType: "uint96" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "MaxVotingSpreadSet",
    inputs: [
      {
        name: "maxVotingSpread",
        type: "uint8",
        indexed: false,
        internalType: "uint8",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RecipientAdded",
    inputs: [
      {
        name: "account",
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
    name: "RecipientRemoved",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
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
    name: "Voted",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "votes",
        type: "tuple[]",
        indexed: false,
        internalType: "struct IFlowCouncil.Vote[]",
        components: [
          { name: "recipient", type: "address", internalType: "address" },
          { name: "amount", type: "uint96", internalType: "uint96" },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VoterAdded",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "votingPower",
        type: "uint96",
        indexed: false,
        internalType: "uint96",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VoterEdited",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "votingPower",
        type: "uint96",
        indexed: false,
        internalType: "uint96",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VoterRemoved",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ALREADY_ADDED",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
  },
  { type: "error", name: "INVALID", inputs: [] },
  { type: "error", name: "NOT_ENOUGH_VOTING_POWER", inputs: [] },
  {
    type: "error",
    name: "NOT_FOUND",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
  },
  { type: "error", name: "TOO_MUCH_VOTING_SPREAD", inputs: [] },
  { type: "error", name: "UNAUTHORIZED", inputs: [] },
] as const;
