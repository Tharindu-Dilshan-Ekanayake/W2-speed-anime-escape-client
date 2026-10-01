import { Component } from 'react'

/**
 * Keeps one failing piece of the scene (e.g. the Bloxity avatar GLB not
 * downloading) from unmounting the whole game. Calls `onError` once, renders
 * `fallback`.
 */
export class SafeBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[game] a scene piece failed to load; continuing without it', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

export default SafeBoundary
