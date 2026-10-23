import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '16px',
            margin: '8px 0',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '13px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>
            {this.props.fallbackTitle ?? 'Panel encountered an error'}
          </div>
          <div
            style={{
              opacity: 0.85,
              marginBottom: '10px',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            {this.state.error?.message || 'An unexpected rendering error occurred'}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '4px 10px',
              backgroundColor: 'var(--c-accent, #38bdf8)',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
