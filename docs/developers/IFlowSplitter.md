# IFlowSplitter
[Git Source](https://github.com/flow-state-coop/flow-splitter/blob/d6cf62277bc3404098fa355ca13a066562862f2e/src/IFlowSplitter.sol)

Interface for the Flow Splitter contract.


## Functions
### createPool

Create a distribution pool and assign the inital units to the members


```solidity
function createPool(
    ISuperToken _poolSuperToken,
    PoolConfig memory _poolConfig,
    PoolERC20Metadata memory _erc20Metadata,
    Member[] memory _members,
    address[] memory _admins,
    string memory _metadata
) external returns (ISuperfluidPool gdaPool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_poolSuperToken`|`ISuperToken`|Address of the token distributed by the pool|
|`_poolConfig`|`PoolConfig`|Set if the units are transferable and if anyone can distribute funds|
|`_erc20Metadata`|`PoolERC20Metadata`|The name, symbol and decimals of the pool|
|`_members`|`Member[]`|The members of the pool|
|`_admins`|`address[]`|Addresses of the pool admins|
|`_metadata`|`string`|metadata of the pool|


### addPoolAdmin

Add a pool admin


```solidity
function addPoolAdmin(uint256 poolId, address admin) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|ID of the pool|
|`admin`|`address`|The address to add|


### removePoolAdmin

Remove a pool admin


```solidity
function removePoolAdmin(uint256 poolId, address admin) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The pool id|
|`admin`|`address`|The address to remove|


### updatePoolAdmins

Update the pool admins


```solidity
function updatePoolAdmins(uint256 poolId, Admin[] memory admins) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The pool id|
|`admins`|`Admin[]`|The address and status of the admins|


### updateMembersUnits

Update the members units


```solidity
function updateMembersUnits(uint256 poolId, Member[] memory members) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The pool id|
|`members`|`Member[]`|The members to update the units of|


### updatePoolMetadata

Update the pool metadata


```solidity
function updatePoolMetadata(uint256 poolId, string memory metadata) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The pool id|
|`metadata`|`string`|The new metadata of the pool|


### isPoolAdmin

Checks if the address is a pool admin


```solidity
function isPoolAdmin(uint256 poolId, address account) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The ID of the pool|
|`account`|`address`|The address to check|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|'true' if the address is a pool admin, otherwise 'false'|


### getPoolById

Get a pool by the id


```solidity
function getPoolById(uint256 poolId) external view returns (Pool memory pool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The id of the pool|


### getPoolByAdminRole

Get a pool by the admin role


```solidity
function getPoolByAdminRole(bytes32 adminRole) external view returns (Pool memory pool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`adminRole`|`bytes32`|The admin role|


### getPoolNameById

Get a pool name by id


```solidity
function getPoolNameById(uint256 _poolId) external view returns (string memory name);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_poolId`|`uint256`|The id of the pool|


### getPoolSymbolById

Get a pool symbol by id


```solidity
function getPoolSymbolById(uint256 _poolId) external view returns (string memory symbol);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_poolId`|`uint256`|The id of the pool|


## Events
### PoolCreated
Emitted when the pool is created


```solidity
event PoolCreated(uint256 indexed poolId, address poolAddress, address token, string metadata);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The id of the pool|
|`poolAddress`|`address`|The address of the pool|
|`token`|`address`|The address of the pool token|
|`metadata`|`string`|The metadata of the pool|

### PoolMetadataUpdated
Emitted when the pool is created


```solidity
event PoolMetadataUpdated(uint256 indexed poolId, string metadata);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolId`|`uint256`|The id of the pool|
|`metadata`|`string`|The new metadata of the pool|

## Errors
### NOT_POOL_ADMIN
Thrown if the caller is not the pool admin


```solidity
error NOT_POOL_ADMIN();
```

### ZERO_ADDRESS
Thrown if address is the zero address


```solidity
error ZERO_ADDRESS();
```

## Structs
### Pool

```solidity
struct Pool {
    uint256 id;
    address poolAddress;
    address token;
    string metadata;
    bytes32 adminRole;
}
```

### Member

```solidity
struct Member {
    address account;
    uint128 units;
}
```

### Admin

```solidity
struct Admin {
    address account;
    AdminStatus status;
}
```

## Enums
### AdminStatus
The status an admin should have


```solidity
enum AdminStatus {
    Added,
    Removed
}
```
