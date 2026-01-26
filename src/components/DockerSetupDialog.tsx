import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface DockerSetupDialogProps {
  onComplete: () => void;
  onCancel?: () => void;
}

type SetupStage = 'detecting' | 'starting' | 'ready' | 'failed';

interface SetupState {
  stage: SetupStage;
  message: string;
  error: string | null;
}

// Docker Desktop download page (opens in browser, user downloads manually)
const DOCKER_DESKTOP_URL = 'https://www.docker.com/products/docker-desktop/';

// Docker Engine installation docs
const DOCKER_ENGINE_DOCS = 'https://docs.docker.com/engine/install/';

function getPlatform(): 'win32' | 'linux' | 'darwin' {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) return 'win32';
  if (platform.includes('linux')) return 'linux';
  return 'darwin';
}

function getPlatformName(): string {
  const platform = getPlatform();
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return 'macOS';
}

function getDockerDesktopUrl(): string {
  return DOCKER_DESKTOP_URL;
}

export function DockerSetupDialog({
  onComplete,
}: DockerSetupDialogProps): React.ReactElement {
  const [state, setState] = useState<SetupState>({
    stage: 'detecting',
    message: 'Checking Docker status...',
    error: null,
  });

  const abortRef = useRef(false);

  // Poll for Docker running state
  const waitForDockerReady = useCallback(async (timeoutMs: number = 60000): Promise<boolean> => {
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (abortRef.current) return false;

      try {
        const dockerState = await window.electronAPI.detectDockerState();
        if (dockerState.running) {
          return true;
        }
      } catch {
        // Ignore errors, keep polling
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }, []);

  // Main setup flow
  const runSetup = useCallback(async () => {
    abortRef.current = false;

    // Stage 1: Detecting
    setState({
      stage: 'detecting',
      message: 'Checking Docker status...',
      error: null,
    });

    try {
      const dockerState = await window.electronAPI.detectDockerState();

      if (dockerState.running) {
        // Docker is already running
        setState({
          stage: 'ready',
          message: 'Docker is ready!',
          error: null,
        });
        setTimeout(() => {
          if (!abortRef.current) onComplete();
        }, 1000);
        return;
      }

      // If Docker not running and we're on Linux, try starting Docker Engine first
      if (getPlatform() === 'linux') {
        setState({
          stage: 'starting',
          message: 'Starting Docker Engine...',
          error: null,
        });

        try {
          const engineStarted = await window.electronAPI.startDockerEngine();
          if (engineStarted) {
            setState({ stage: 'ready', message: 'Docker is ready!', error: null });
            setTimeout(() => {
              if (!abortRef.current) onComplete();
            }, 1000);
            return;
          }
        } catch {
          // Engine start failed (user cancelled sudo or not installed), continue to try Desktop
        }
      }

      if (dockerState.desktopPath) {
        // Docker Desktop installed but not running - try to start it
        setState({
          stage: 'starting',
          message: 'Starting Docker Desktop...',
          error: null,
        });

        try {
          await window.electronAPI.startDockerDesktop();
        } catch {
          // Start command may return even if Docker is still launching
        }

        // Wait for Docker to be ready
        const isReady = await waitForDockerReady(60000);

        if (abortRef.current) return;

        if (isReady) {
          setState({
            stage: 'ready',
            message: 'Docker is ready!',
            error: null,
          });
          setTimeout(() => {
            if (!abortRef.current) onComplete();
          }, 1000);
          return;
        }

        // Timeout - failed to start
        setState({
          stage: 'failed',
          message: 'Docker Desktop failed to start',
          error: 'Docker Desktop was found but could not be started. Please start it manually.',
        });
        return;
      }

      // Docker not installed - show manual installation instructions
      setState({
        stage: 'failed',
        message: 'Docker not found',
        error: 'Docker is required to run Yolium. Please install Docker and try again.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState({
        stage: 'failed',
        message: 'Detection failed',
        error: errorMessage,
      });
    }
  }, [onComplete, waitForDockerReady]);

  // Run setup on mount
  useEffect(() => {
    runSetup();

    return () => {
      abortRef.current = true;
    };
  }, [runSetup]);

  // Retry handler
  const handleRetry = useCallback(() => {
    runSetup();
  }, [runSetup]);

  // Open download link in external browser
  const handleOpenDockerDesktop = useCallback(() => {
    window.electronAPI.openExternal(getDockerDesktopUrl());
  }, []);

  const handleOpenDockerEngine = useCallback(() => {
    window.electronAPI.openExternal(DOCKER_ENGINE_DOCS);
  }, []);

  // Render manual instructions based on platform
  const renderManualInstructions = () => {
    const platform = getPlatform();
    const platformName = getPlatformName();

    if (platform === 'linux') {
      return (
        <div className="w-full mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Install Docker on {platformName}
          </h3>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400 mb-2">
                <strong>Option 1: Docker Engine</strong> (Recommended for Linux)
              </p>
              <code className="block text-xs bg-gray-800 p-2 rounded text-green-400 overflow-x-auto">
                curl -fsSL https://get.docker.com | sh
              </code>
            </div>

            <div className="border-t border-gray-700 pt-3">
              <p className="text-sm text-gray-400 mb-2">
                <strong>Option 2: Docker Desktop</strong>
              </p>
              <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                <li>Download Docker Desktop for Linux</li>
                <li>Install the .deb or .rpm package</li>
                <li>Start Docker Desktop</li>
              </ol>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            After installing, restart Yolium Desktop.
          </p>
        </div>
      );
    }

    // Windows and macOS - Docker Desktop required
    return (
      <div className="w-full mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          Install Docker Desktop for {platformName}
        </h3>
        <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
          <li>Download Docker Desktop</li>
          <li>Run the installer and follow the prompts</li>
          <li>Start Docker Desktop</li>
          <li>Restart Yolium Desktop</li>
        </ol>
      </div>
    );
  };

  // Render action buttons based on platform
  const renderActionButtons = () => {
    const platform = getPlatform();

    return (
      <div className="flex flex-wrap gap-3 mt-2">
        <button
          data-testid="docker-retry-button"
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
        <button
          onClick={handleOpenDockerDesktop}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Docker Desktop
        </button>
        {platform === 'linux' && (
          <button
            onClick={handleOpenDockerEngine}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Docker Engine Docs
          </button>
        )}
      </div>
    );
  };

  // Render content based on stage
  const renderContent = () => {
    switch (state.stage) {
      case 'detecting':
      case 'starting':
        return (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
            <p className="text-gray-300 text-center">{state.message}</p>
          </div>
        );

      case 'ready':
        return (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-gray-300 text-center">{state.message}</p>
          </div>
        );

      case 'failed':
        return (
          <div className="flex flex-col items-center gap-4 w-full">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-gray-300 text-center font-medium">{state.message}</p>
            {state.error && (
              <p className="text-sm text-gray-400 text-center">{state.error}</p>
            )}

            {renderManualInstructions()}
            {renderActionButtons()}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div data-testid="docker-setup-dialog" className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <svg
            className="w-8 h-8 text-blue-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            {/* Docker logo simplified */}
            <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.185V3.576a.186.186 0 00-.186-.186h-2.118a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm0 2.716h2.118a.186.186 0 00.186-.185V6.292a.186.186 0 00-.186-.186h-2.118a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm-2.955 0h2.119a.186.186 0 00.185-.185V6.292a.186.186 0 00-.185-.186H8.074a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm0 2.714h2.119a.186.186 0 00.185-.185V9.006a.186.186 0 00-.185-.186H8.074a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm-2.955 0h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186H5.119a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm0 2.714h2.118a.186.186 0 00.186-.185v-1.887a.186.186 0 00-.186-.186H5.119a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm-2.956 0h2.119a.186.186 0 00.185-.185v-1.887a.186.186 0 00-.185-.186H2.163a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185zm21.298-1.82c-.449-.39-1.482-.59-2.27-.376-.117-1.086-.736-2.031-1.438-2.79l-.292-.29-.29.293c-.577.577-.888 1.38-.847 2.194.031.586.206 1.123.515 1.582-.237.139-.501.262-.787.368-.556.208-1.141.314-1.74.314H.055l-.022.19c-.117 1.193.077 2.386.569 3.482l.238.451.003.006c1.333 2.392 3.685 3.59 6.985 3.574 6.305-.031 10.983-2.942 13.152-8.283 1.218.066 2.418-.362 3.018-1.35l.148-.238-.288-.227z" />
          </svg>
          <div>
            <h2 className="text-lg font-semibold text-white">Docker Setup</h2>
            <p className="text-sm text-gray-400">
              Yolium requires Docker to run
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-[160px] flex items-center justify-center">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
