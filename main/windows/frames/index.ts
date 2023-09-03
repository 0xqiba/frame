// Frames are the windows that run dapps and other functionality
// They are rendered based on the state of `windows.workspaces`
import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron'

import log from 'electron-log'
import store from '../../store'

import frameInstances, { FrameInstance } from './frameInstances.js'
import viewInstances from './viewInstances'

import dapps from '../../dapps'

import type { Frame } from '../../store/state'

import { Workspace, Nav, View } from '../workspace/types'

function getFrames(): Record<string, Workspace> {
  return store('windows.workspaces') || {}
}

// Functionaliy of a workspace

// A workspace is a full-sized native window that acts like a normal app window

// Each workspace has a nav stack

// Each Nav item fully describes the display of the workspace

// Each Nav also includes any views that should be placed on the workspace

// A view is a browser view that is attached to a workspace

// Views can only run installed dapps

// Frame and View instances are created based on this state

// When Frame and Views are created they add their status to the store in workspacesMeta

// const showMenu = () => {
//   // Define the menu as per your requirement
//   const template: MenuItemConstructorOptions[] = [
//     {
//       label: 'File',
//       submenu: [{ role: 'quit' }]
//     }
//   ]

//   const menu = Menu.buildFromTemplate(template)
//   Menu.setApplicationMenu(menu)
// }

// const hideMenu = () => {
//   Menu.setApplicationMenu(null) // Removes the application menu
// }

let showQueue: boolean[] = []
let processing = false

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let showing = false
const processQueue = async () => {
  if (processing) return
  processing = true

  while (showQueue.length > 0) {
    const show = showQueue.pop() // Take the most recent state from the queue
    showQueue = [] // Clear any intermediate requests
    if (app.dock) {
      if (show && show !== showing) {
        showing = true
        await app.dock.show()
        await wait(800) // Wait for 200ms to make sure the show is done
      } else {
        showing = false
        app.dock.hide()
        // Menu.setApplicationMenu(null) // Removes the application menu
      }
    }
  }

  processing = false
}

const showDock = (show: boolean) => {
  showQueue.push(show) // Push the requested state into the queue
  processQueue() // Start processing the queue if not already doing so
}

export default class WorkspaceManager {
  private frameInstances: Record<string, FrameInstance> = {}

  start() {
    store.observer(() => {
      const inFocus = store('main.focusedFrame')

      const frames = getFrames()

      // const frameIds = Object.keys(frames)

      // if (frameIds && frameIds.length > 0) {
      //   showDock(true)
      // } else {
      //   showDock(false)
      // }

      this.manageFrames(frames, inFocus)
      this.manageViews(frames)
      // manageOverlays(frames)
    })
  }

  manageFrames(frames: Record<string, Workspace>, inFocus: string) {
    const frameIds = Object.keys(frames)
    const instanceIds = Object.keys(this.frameInstances)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        const frameInstance = frameInstances.create(frames[frameId])

        this.frameInstances[frameId] = frameInstance

        frameInstance.on('closed', () => {
          this.removeFrameInstance(frameId)
          store.removeWorkspace(frameId)
        })

        frameInstance.on('maximize', () => {
          store.updateFrame(frameId, { maximized: true })
        })

        frameInstance.on('unmaximize', () => {
          store.updateFrame(frameId, { maximized: false })
        })

        frameInstance.on('enter-full-screen', () => {
          store.updateFrame(frameId, { fullscreen: true })
        })

        frameInstance.on('leave-full-screen', () => {
          const platform = store('platform')
          // Handle broken linux window events
          if (platform !== 'win32' && platform !== 'darwin' && !frameInstance.isFullScreen()) {
            if (frameInstance.isMaximized()) {
              // Trigger views to reposition
              setTimeout(() => {
                const frame = frames[frameId]
                const currentNav = frame.nav[0]
                if (currentNav.views[0].id) viewInstances.position(frameInstance, currentNav.views[0].id)
              }, 100)
              store.updateFrame(frameId, { maximized: true })
            } else {
              store.updateFrame(frameId, { maximized: false })
            }
          } else {
            store.updateFrame(frameId, { fullscreen: false })
          }
        })

        frameInstance.on('focus', () => {
          // Give focus to current view
          const frame = frames[frameId]
          const currentNav = frame.nav[0]
          const currentView = currentNav?.views[0]?.id
          if (currentView && frameInstance) {
            frameInstance.views = frameInstance.views || {}
            frameInstance.views[currentView]?.webContents?.focus()
          }
        })
      })

    // destroy each frame instance that is no longer in the store
    instanceIds
      .filter((instanceId) => !frameIds.includes(instanceId))
      .forEach((instanceId) => {
        this.removeFrameInstance(instanceId)

        // if (frameInstance) {
        //   frameInstance.destroy()
        // }
      })

    if (inFocus) {
      const focusedFrame = this.frameInstances[inFocus] || { isFocused: () => true }

      if (!focusedFrame.isFocused()) {
        focusedFrame.show()
        focusedFrame.focus()
      }
    }
  }

  //   when the app adds or removes views from a frame
  // I will do so directly on in the store
  // then this function will manage the views on the frame instances
  // the store will be a

  // Information about the frames/views is stored in the state else where

  manageViews(frames: Record<string, Workspace>) {
    const frameIds = Object.keys(frames)

    frameIds.forEach((frameId) => {
      const frameInstance = this.frameInstances[frameId]
      // console.log('frameInstance', frameInstance)
      if (!frameInstance) return log.error('Instance not found when managing views')

      // Frame definition in the state
      const frame = frames[frameId]

      // Current Nav
      const currentNav = frame?.nav[0]
      const currentNavViewIds = currentNav?.views?.map((view) => view.id) || []

      // Get all views from the nav
      const frameViewIds = frame.nav.flatMap((nav) => nav.views.map((view) => view.id))
      const frameInstanceViews = frameInstance.views || {}
      // console.log('frameInstanceViews 1', frameInstanceViews)
      const instanceViewIds = Object.keys(frameInstanceViews)

      // For any instance views that are no longer in the nav anywhere, destroy them
      instanceViewIds
        .filter((instanceViewId) => !frameViewIds.includes(instanceViewId))
        .forEach((instanceViewId) => viewInstances.destroy(frameInstance, instanceViewId))

      // // Frame definition in the state
      // const frame = frames[frameId];

      // // Current Nav
      // const currentNav = frame?.nav[0];
      // const currentNavViewIds = currentNav?.views?.map((view) => view.id) || [];

      // // Get all views from the nav
      // const frameNavViewIds = frame.nav.flatMap((nav) => nav.views.map((view) => view.id));
      // const frameNavForwardViewIds = frame.navForward.flatMap((nav) => nav.views.map((view) => view.id));

      // // Combine view IDs from both nav and navForward
      // const allFrameViewIds = [...frameNavViewIds, ...frameNavForwardViewIds];

      // const frameInstanceViews = frameInstance.views || {};
      // const instanceViewIds = Object.keys(frameInstanceViews);

      // // For any instance views that are no longer in the nav or navForward anywhere, destroy them
      // instanceViewIds
      //   .filter((instanceViewId) => !allFrameViewIds.includes(instanceViewId))
      //   .forEach((instanceViewId) => viewInstances.destroy(frameInstance, instanceViewId));

      // For each view in the current nav
      currentNav?.views?.forEach((view) => {
        if (view.id) {
          // Create if needed
          if (!instanceViewIds.includes(view.id)) viewInstances.create(frameInstance, view)
          // Get the view instance
          const viewInstance = frameInstance?.views && frameInstance?.views[view.id]
          if (!viewInstance) return log.error('View instance not found when managing views')

          // Get view stats
          const viewMeta = { ready: true } //TODO: store('workspacesMeta', frame.id, 'views', view.id)
          // Show all in the current nav
          if (viewMeta.ready && currentNavViewIds.includes(view.id)) {
            frameInstance.addBrowserView(viewInstance)
            viewInstances.position(frameInstance, view.id)
            setTimeout(() => {
              if (frameInstance.isFocused()) viewInstance.webContents.focus()
            }, 100)
          } else {
            frameInstance.removeBrowserView(viewInstance)
          }
        }
      })

      instanceViewIds.forEach((instanceViewId) => {
        if (!currentNavViewIds.includes(instanceViewId)) {
          const viewInstance = frameInstance?.views && frameInstance?.views[instanceViewId]
          if (viewInstance) frameInstance.removeBrowserView(viewInstance)
        }
      })

      // // For each view in the store that belongs to this frame
      // frameViewIds.forEach((frameViewId) => {
      //   const viewData = frame.views[frameViewId] || {}
      //   const viewInstance = frameInstanceViews[frameViewId] || {}

      //   // Create them
      //   if (!instanceViewIds.includes(frameViewId)) viewInstances.create(frameInstance, viewData)

      //   // Show the correct one
      //   if (
      //     frame.currentView === frameViewId &&
      //     viewData.ready &&
      //     frameInstance.showingView !== frameViewId
      //   ) {
      //     frameInstance.addBrowserView(viewInstance)
      //     frameInstance.showingView = frameViewId
      //     viewInstances.position(frameInstance, frameViewId)
      //     setTimeout(() => {
      //       if (frameInstance.isFocused()) viewInstance.webContents.focus()
      //     }, 100)
      //   } else if (frame.currentView !== frameViewId && frameInstance.showingView === frameViewId) {
      //     frameInstance.removeBrowserView(viewInstance)
      //     frameInstance.showingView = ''
      //   }
      // })
    })

    // if (nav && nav.views) {
    // if there are nav.views they should be shown
    // If a matching view doesn't exist on the frame instance, create it
    // Now all views needed exist
    // Show all matching views
    // Hide all non-matching views
    // Also make sure all view instances on the frame existance exist somewhere in nav, if they don't destroy them
    // }
  }

  // when the app adds or removes views from a frame
  // I will do so directly on in the store
  // then this function will manage the views on the frame instances
  // the store will be a

  // Information about the frames/views is stored in the state else where

  // manageViews(frames: Record<string, Workspace>) {
  //   const frameIds = Object.keys(frames)

  //   frameIds.forEach((frameId) => {
  //     const frameInstance = this.frameInstances[frameId]
  //     if (!frameInstance) return log.error('Instance not found when managing views')

  //     // Frame definition in the state
  //     const frame = frames[frameId]

  //     const nav = frame.nav[0] || { component: 'default', data: {} }

  //     if (nav.views) {
  //       // if there are nav.views they should be shown
  //       // Check views that exist on the frame instance
  //       // If a matching view doesn't exist on the frame instance, create it
  //       // Now all views needed exist
  //       // Show all matching views
  //       // Hide all non-matching views
  //       // Also make sure all view instances on the frame existance exist somewhere in nav, if they don't destroy them
  //     }

  //     const frameInstanceViews = frameInstance.views || {}
  //     const frameViewIds = Object.keys(frame.views)
  //     const instanceViewIds = Object.keys(frameInstanceViews)

  //     instanceViewIds
  //       .filter((instanceViewId) => !frameViewIds.includes(instanceViewId))
  //       .forEach((instanceViewId) => viewInstances.destroy(frameInstance, instanceViewId))

  //     // For each view in the store that belongs to this frame
  //     frameViewIds.forEach((frameViewId) => {
  //       const viewData = frame.views[frameViewId] || {}
  //       const viewInstance = frameInstanceViews[frameViewId] || {}

  //       // Create them
  //       if (!instanceViewIds.includes(frameViewId)) viewInstances.create(frameInstance, viewData)

  //       // Show the correct one
  //       if (
  //         frame.currentView === frameViewId &&
  //         viewData.ready &&
  //         frameInstance.showingView !== frameViewId
  //       ) {
  //         frameInstance.addBrowserView(viewInstance)
  //         frameInstance.showingView = frameViewId
  //         viewInstances.position(frameInstance, frameViewId)
  //         setTimeout(() => {
  //           if (frameInstance.isFocused()) viewInstance.webContents.focus()
  //         }, 100)
  //       } else if (frame.currentView !== frameViewId && frameInstance.showingView === frameViewId) {
  //         frameInstance.removeBrowserView(viewInstance)
  //         frameInstance.showingView = ''
  //       }
  //     })
  //   })
  // }

  removeFrameInstance(frameId: string) {
    const frameInstance = this.frameInstances[frameId]

    Object.keys(frameInstance.views || {}).forEach((viewId) => {
      viewInstances.destroy(frameInstance, viewId)
    })

    delete this.frameInstances[frameId]

    if (frameInstance) {
      frameInstance.removeAllListeners('closed')
      frameInstance.destroy()
    }

    if (Object.keys(this.frameInstances).length === 0) {
      app.dock.hide()
      // Menu.setApplicationMenu(null) // Removes the application menu
    }
  }

  private sendMessageToFrame(frameId: string, channel: string, ...args: any) {
    const frameInstance = this.frameInstances[frameId]

    if (frameInstance && !frameInstance.isDestroyed()) {
      const webContents = frameInstance.webContents
      if (webContents) webContents.send(channel, ...args)
    } else {
      log.error(
        new Error(
          `Tried to send a message to frame with id ${frameId} but it does not exist or has been destroyed`
        )
      )
    }
  }

  broadcast(channel: string, args: any[]) {
    Object.keys(this.frameInstances).forEach((id) => this.sendMessageToFrame(id, channel, ...args))
  }

  reloadFrames() {
    Object.keys(this.frameInstances).forEach((win) => {
      this.frameInstances[win].webContents.reload()
    })
  }

  refocus(id: string) {
    const frameInstance = this.frameInstances[id]
    if (frameInstance) {
      frameInstance.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      frameInstance.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      frameInstance.show()
      frameInstance.focus()
    }
  }

  isFrameShowing() {
    return Object.keys(this.frameInstances).some((win) => this.frameInstances[win].isVisible())
  }
}
