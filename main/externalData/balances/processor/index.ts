import log from 'electron-log'

import { isEqual } from 'lodash'
import surface from '../../surface'
import { storeApi } from '../../storeApi'
import { isNativeCurrency, toTokenId } from '../../../../resources/domain/balance'

import type { Token, TokenBalance } from '../../../store/state'
import { NATIVE_CURRENCY } from '../../../../resources/constants'

type UpdatedBalance = TokenBalance & { hideByDefault?: boolean }

const toExpiryWindow = {
  snapshot: 1000 * 60 * 5,
  scan: 1000 * 60
} as const

const getChangedBalances = (address: string, tokenBalances: TokenBalance[]): TokenBalance[] => {
  const currentTokenBalances = storeApi.getTokenBalances(address)
  const customTokens = new Set(storeApi.getCustomTokens().map(toTokenId))

  return tokenBalances.reduce((balances, newBalance) => {
    const { address: newAddress, chainId: newChainId, balance: newBalanceValue } = newBalance

    const currentBalance = currentTokenBalances.find(
      ({ address, chainId }) => address === newAddress && chainId === newChainId
    )

    const isCustomToken = customTokens.has(toTokenId(newBalance))

    const hasChanged = isCustomToken
      ? currentBalance?.balance !== newBalanceValue
      : !isEqual(currentBalance, newBalance)

    if (!currentBalance || hasChanged) {
      balances.push(newBalance)
    }

    return balances
  }, [] as TokenBalance[])
}

//Splits token balances into non-zero and zero balance tokens
const splitTokenBalances = (balances: TokenBalance[]) => {
  return balances.reduce(
    (acc, balance) => {
      // ignore native currencies
      if (isNativeCurrency(balance.address)) return acc

      const { toAdd: nonZeroBalanceTokens, toRemove: zeroBalanceTokens } = acc

      return parseInt(balance.balance)
        ? { toAdd: [...nonZeroBalanceTokens, balance], toRemove: zeroBalanceTokens }
        : { toAdd: nonZeroBalanceTokens, toRemove: [...zeroBalanceTokens, balance] }
    },
    {
      toAdd: [] as TokenBalance[],
      toRemove: [] as TokenBalance[]
    }
  )
}

const mergeCustomAndNative = (balances: TokenBalance[]) => {
  // Retrieve custom tokens from the store
  const custom = storeApi.getCustomTokens()

  // Convert custom tokens array to an object for easier manipulation
  const customData = custom.reduce((data, token) => {
    data[toTokenId(token)] = token
    return data
  }, {} as Record<string, Token>)

  // Merge balances with the custom data
  const mergedBalances = balances.map((balance) => {
    const tokenId = toTokenId(balance)

    if (tokenId in customData) {
      const { name, symbol, decimals } = customData[tokenId]
      balance = { ...balance, name, symbol, decimals }

      // Remove the merged custom token
      delete customData[tokenId]
    }

    if (isNativeCurrency(balance.address)) {
      const nativeCurrency = storeApi.getNativeCurrency(balance.chainId)
      if (nativeCurrency) {
        const { symbol, decimals, name, media } = nativeCurrency
        balance = { ...balance, symbol, decimals, name, address: NATIVE_CURRENCY, media }
      }
    }

    return balance
  })

  // Check for any missing custom tokens
  const missingCustomTokens = Object.values(customData)
  if (missingCustomTokens.length) {
    log.debug({ missingCustomTokens })
  }

  // Add missing balances with zero balance
  const missingBalances = missingCustomTokens.map((token) => ({
    ...token,
    balance: '0x00',
    displayBalance: '0'
  }))

  return [...mergedBalances, ...missingBalances]
}

const hideUnknownTokens = (balances: UpdatedBalance[]) => {
  const knownTokens = storeApi.getKnownTokens()
  const knownTokenIds = new Set(knownTokens.map(toTokenId))

  const toHide = balances.filter((balance) => {
    const tokenId = toTokenId(balance)
    return !knownTokenIds.has(tokenId) && balance.hideByDefault
  })

  toHide.forEach((balance) => storeApi.hideToken(balance.chainId, balance.address))
}

function updateStoredTokens(address: string, zeroBalances: TokenBalance[], tokenBalances: TokenBalance[]) {
  const zeroBalanceSet = new Set(zeroBalances.map(toTokenId))
  if (zeroBalanceSet.size) {
    storeApi.removeKnownTokens(address, zeroBalanceSet)
  }

  if (tokenBalances.length) {
    storeApi.addKnownTokens(address, tokenBalances)
  }
}

export function handleBalanceUpdate(
  address: string,
  balances: UpdatedBalance[],
  chains: number[],
  mode: keyof typeof toExpiryWindow
) {
  log.debug('Handling balance update', { address, chains })
  hideUnknownTokens(balances)
  const withLocalData = mergeCustomAndNative(balances)

  const changedBalances = getChangedBalances(address, withLocalData)

  if (changedBalances.length) {
    storeApi.setBalances(address, changedBalances)
    const { toAdd, toRemove } = splitTokenBalances(changedBalances)
    updateStoredTokens(address, toRemove, toAdd)

    storeApi.setAccountTokensUpdated(address)
  }

  storeApi.addPopulatedChains(address, chains, toExpiryWindow[mode])
}

export function handleCustomTokenUpdate(customTokens: Token[]) {
  log.debug('Handling custom token update', { customTokens })

  const accounts = storeApi.getAccounts()

  accounts.forEach((address) => {
    const balances = storeApi.getTokenBalances(address)
    const forProcessor = customTokens.filter((token) => surface.networks.has(address, token.chainId))
    const newBalances = forProcessor.reduce((bals, item) => {
      const tokenId = toTokenId(item)

      const existing = balances.find((b) => toTokenId(b) === tokenId)
      const { displayBalance, balance } = existing || { displayBalance: '0', balance: '0x00' }
      return bals.concat({
        ...item,
        displayBalance,
        balance
      })
    }, [] as TokenBalance[])

    if (newBalances.length) {
      storeApi.setBalances(address, newBalances)
    }
  })
}
