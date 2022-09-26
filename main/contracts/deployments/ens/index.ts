import { BigNumber } from 'ethers'
import { Fragment, Interface } from 'ethers/lib/utils'

import { registrar as registrarAbi, registrarController as registrarControllerAbi } from './abi'
import { Contract } from '../../../reveal'
import store from '../../../store'

import type { JsonFragment } from '@ethersproject/abi'

namespace ENS {
  export type Register = {
    name: string
    owner: string
    duration: BigNumber // seconds
    resolver?: string
  }

  export type Renew = {
    name: string
    duration: BigNumber // seconds
  }

  export type Transfer = {
    from: string
    to: string
    tokenId: BigNumber
  }

  export type Approval = {
    to: string
    tokenId: BigNumber
  }
}

type DeploymentLocation = {
  name?: string
  address: Address
  chainId: number
}

function decode (abi: ReadonlyArray<Fragment | JsonFragment | string>, calldata: string) {
  const contractApi = new Interface(abi)
  return contractApi.parseTransaction({ data: calldata })
}

function getNameForTokenId (account: string, tokenId: string) {
  const ensInventory: InventoryCollection = store('main.inventory', account, 'ens') || {}
  const items = ensInventory.items || {}

  const record = Object.values(items).find(ens => ens.tokenId === tokenId) || { name: '' }

  return record.name
}

const registrar = ({ name = 'ENS Registrar', address, chainId }: DeploymentLocation): Contract => {
  return {
    name,
    chainId,
    address,
    decode: (calldata: string, { account } = {}) => {
      const { name, args } = decode(registrarAbi, calldata)

      if (['transferfrom', 'safetransferfrom'].includes(name.toLowerCase())) {
        const { from, to, tokenId } = args as unknown as ENS.Transfer
        const token = tokenId.toString()
        const name = (account && getNameForTokenId(account, token)) || ''

        return {
          id: 'ens:transfer',
          data: {
            name: name, from, to, tokenId: token }
        }
      }

      if (name === 'approve') {
        const { to, tokenId } = args as unknown as ENS.Approval
        const token = tokenId.toString()
        const name = (account && getNameForTokenId(account, token)) || ''

        return {
          id: 'ens:approve',
          data: { name, operator: to, tokenId: token }
        }
      }
    }
  }
}

const registarController = ({ name = 'ENS Registrar Controller', address, chainId }: DeploymentLocation): Contract => {
  return {
    name,
    chainId,
    address,
    decode: (calldata: string) => {
      const { name, args } = decode(registrarControllerAbi, calldata)

      if (name === 'commit') {
        return {
          id: 'ens:commit'
        }
      }

      if (['register', 'registerwithconfig'].includes(name.toLowerCase())) {
        const { owner, name, duration, resolver } = args as unknown as ENS.Register

        return {
          id: 'ens:register',
          data: { address: owner, name, duration: duration.toNumber() }
        }
      }

      if (name === 'renew') {
        const { name, duration } = args as unknown as ENS.Renew

        return {
          id: 'ens:renew',
          data: { name, duration: duration.toNumber() }
        }
      }
    }
  }
}

const mainnetRegistrar = registrar({
  name: '.eth Permanent Registrar',
  address: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85',
  chainId: 1
})

const mainnetRegistrarController = registarController({
  name: 'ETHRegistrarController',
  address: '0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5',
  chainId: 1
})

// TODO: in the future the addresses for these contracts can be discovered in real time
export default [mainnetRegistrar, mainnetRegistrarController]
