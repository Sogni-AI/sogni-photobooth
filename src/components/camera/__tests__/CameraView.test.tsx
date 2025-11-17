import { createRef } from 'react';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';
import { CameraView } from '../CameraView';

describe('CameraView', () => {
  // Create a proper ref with a non-null assertion to match the expected type
  const mockVideo = document.createElement('video');
  const mockVideoRef = createRef<HTMLVideoElement>();
  // Force the ref's current property to be the mock video element
  Object.defineProperty(mockVideoRef, 'current', {
    value: mockVideo,
    writable: true
  });
  
  const defaultProps = {
    videoRef: mockVideoRef,
    isReady: true,
    onTakePhoto: jest.fn(),
    selectedStyle: 'watercolor',
    onStyleSelect: jest.fn(),
    showSettings: false,
    onToggleSettings: jest.fn(),
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('renders correctly with all expected elements', () => {
    render(<CameraView {...defaultProps} />);
    expect(screen.getByText('SOGNI PHOTOBOOTH')).toBeInTheDocument();
    expect(screen.getByTestId('webcam-video')).toBeInTheDocument();
    expect(screen.getByTestId('shutter-button')).toBeInTheDocument();
    expect(screen.getByTestId('style-button')).toBeInTheDocument();
    expect(screen.getByTestId('settings-button')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<CameraView {...defaultProps} />);
    expect(screen.getByText('SOGNI PHOTOBOOTH')).toBeInTheDocument();
  });

  it('renders the settings button', () => {
    render(<CameraView {...defaultProps} />);
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('calls onToggleSettings when settings button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsButton);
    expect(defaultProps.onToggleSettings).toHaveBeenCalled();
  });

  it('renders the style selector with current style', () => {
    render(<CameraView {...defaultProps} />);
    const styleButton = screen.getByRole('button', { name: defaultProps.selectedStyle });
    expect(styleButton).toBeInTheDocument();
  });

  it('calls onStyleSelect when style button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const styleButton = screen.getByRole('button', { name: defaultProps.selectedStyle });
    fireEvent.click(styleButton);
    expect(defaultProps.onStyleSelect).toHaveBeenCalled();
  });

  it('does not render a countdown overlay (countdown is now rendered in App)', () => {
    render(<CameraView {...defaultProps} />);
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
  });

  it('disables shutter button when isDisabled is true', () => {
    render(<CameraView {...defaultProps} isDisabled={true} />);
    const shutterButton = screen.getByTestId('shutter-button');
    expect(shutterButton).toBeDisabled();
  });

  it('calls onTakePhoto when shutter button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const shutterButton = screen.getByTestId('shutter-button');
    fireEvent.click(shutterButton);
    expect(defaultProps.onTakePhoto).toHaveBeenCalled();
  });

  it('hides camera view when photo grid is shown', () => {
    render(<CameraView {...defaultProps} showPhotoGrid={true} />);
    const container = screen.getByTestId('camera-container');
    expect(container).toHaveStyle({ display: 'none' });
  });

  it('shows camera view when photo grid is hidden', () => {
    render(<CameraView {...defaultProps} showPhotoGrid={false} />);
    const container = screen.getByTestId('camera-container');
    expect(container).not.toHaveStyle({ display: 'none' });
  });

  it('applies custom testId to container', () => {
    render(<CameraView {...defaultProps} testId="custom-camera" />);
    expect(screen.getByTestId('custom-camera')).toBeInTheDocument();
  });

  it('adds cooldown class to shutter button when disabled', () => {
    render(<CameraView {...defaultProps} isDisabled={true} />);
    expect(screen.getByTestId('shutter-button')).toHaveClass('cooldown');
  });
}); 