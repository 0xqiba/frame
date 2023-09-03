import React from 'react'
import useStore from '../../../../resources/Hooks/useStore.js'
import link from '../../../../resources/link/index.js'

import styled from 'styled-components'

const FailedToLoad = () => {
  return (
    <div className='mainDappLoadingText'>
      <div>{'Send dapp failed to load'}</div>
    </div>
  )
}

const MainnetDisconnected = () => {
  return (
    <>
      <div className='mainDappLoadingText'>
        <div>{'Mainnet connection required'}</div>
        <div>{'to resolve ENS for Send dapp'}</div>
      </div>
      <div
        className='mainDappEnableChains'
        onClick={() => {
          link.send('tray:action', 'navDash', { view: 'chains', data: {} })
          setTimeout(() => {
            link.send('frame:close')
          }, 100)
        }}
      >
        View Chains
      </div>
    </>
  )
}

const Error = ({ isMainnetConnected }) => {
  if (!isMainnetConnected) {
    return <MainnetDisconnected />
  }

  return <FailedToLoad />
}

const ViewWrap = styled.div`
  position: absolute;
  top: 8px;
  left: 0px;
  right: 8px;
  bottom: 8px;
  z-index: 99999999;
  /* background: linear-gradient(135deg, var(--ghostA), var(--ghostAZ)); */
  border: 1px solid linear-gradient(135deg, red, var(--ghostAZ));
  background: var(--ghostAZ);
  border-radius: 8px;
  box-shadow: 0px 0px 16px var(--ghostY);
`

const App = ({ id }) => {
  const dapp = useStore(`main.dapp.details.${id}`)
  let name = dapp ? dapp.domain : null
  if (name) {
    name = name.split('.')
    name.pop()
    name.reverse()
    name.forEach((v, i) => {
      name[i] = v.charAt(0).toUpperCase() + v.slice(1)
    })
    name = name.join(' ')
  }

  const frame = useStore('windows.workspaces', window.frameId)
  console.log('frame!!!: ', frame)
  // TODO: allow multiple views, this also needs to use meta area
  // const { ready } = frame?.nav[0].views ? frame?.nav[0].views[0] : {}

  const ready = true

  console.log('VIEW READY? ', ready)

  // Hard code send dapp status for now
  const sendDapp =
    useStore('main.dapps', '0xe8d705c28f65bc3fe10df8b22f9daa265b99d0e1893b2df49fd38120f0410bca') || {}

  const mainnet = useStore('main.networks.ethereum.1')
  const isMainnetConnected =
    mainnet.on && (mainnet.connection.primary.connected || mainnet.connection.secondary.connected)

  const shouldDisplayError =
    (sendDapp.status !== 'ready' && !isMainnetConnected) || sendDapp.status === 'failed'

  const bg = sendDapp.colors.background || null

  return (
    <>
      <ViewWrap style={bg ? { background: bg } : {}} />
      {/* <div className='mainTop' />
      <div className='mainDappLoading'>
        {shouldDisplayError ? (
          <Error isMainnetConnected={isMainnetConnected} />
        ) : (
          !ready && <div className='loader' />
        )}
      </div> */}
    </>
  )
}

export default App

// The new version of this app will be able to act as a top level resolver for many different
// app experiences, these are:
// - Running a dapp for now this is the Send dapp
// - Showing the settings page where everything from the dash is moved over to a new experience
// - Launching platfom realted functionality and UI for varius flows related to the platform.command
// - Showing the onboarding experience
// - Showing the anything from the main wallet experiecne that needs more room
// - this can be expanded balances, inventory, contract source, etc

// const App = () => {
//   //
// }
