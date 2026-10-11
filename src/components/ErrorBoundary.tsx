import { Component, type ReactNode } from 'react'
import { tr } from '../lib/i18n'

type S = { error: Error | null }
/** A page that throws (a hostile entity, a bug) shows a short note instead of unmounting the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, S> {
  state: S = { error: null }
  static getDerivedStateFromError(error: Error): S {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[switched-off] render failed', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel" role="alert" style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
        <b>{tr('This part of the page could not be drawn.')}</b>
        <span className="mute">{tr('Something on the register did not match the shape the page expects. The rest of the site still works; reloading usually clears it.')}</span>
        <span className="row"><button className="btn small" onClick={() => this.setState({ error: null })}>{tr('Try again')}</button><a className="btn small" href="/">{tr('Home')}</a></span>
      </div>
    )
  }
}
