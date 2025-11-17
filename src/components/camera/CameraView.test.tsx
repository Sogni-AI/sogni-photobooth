/** @jsxImportSource react */
import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { CameraView } from './CameraView';

// Use React in a way that TypeScript recognizes
const { Fragment } = React;

describe('CameraView', () => {
  const mockVideoRef = createRef<HTMLVideoElement>();
  
  const defaultProps = {
    videoRef: mockVideoRef,
    isReady: true,
    onTakePhoto: jest.fn(),
    selectedStyle: 'watercolor',
    onStyleSelect: jest.fn(),
    showSettings: false,
    onToggleSettings: jest.fn(),
  };

  it('renders correctly with all expected elements', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    // Check for key elements
    expect(screen.getByText('SOGNI PHOTOBOOTH')).toBeInTheDocument();
    expect(screen.getByTestId('webcam-video')).toBeInTheDocument();
    expect(screen.getByTestId('shutter-button')).toBeInTheDocument();
    expect(screen.getByTestId('style-button')).toBeInTheDocument();
    expect(screen.getByTestId('settings-button')).toBeInTheDocument();
  });

  it('shows the correct prompt text with "Prompt:" prefix', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    const styleButton = screen.getByTestId('style-button');
    expect(styleButton.textContent).toContain('Prompt: Watercolor');
  });

  it('opens style dropdown when clicking the style button', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    const styleButton = screen.getByTestId('style-button');
    fireEvent.click(styleButton);
    
    // Check if dropdown opened with featured options
    expect(screen.getByText('Random: All')).toBeInTheDocument();
    expect(screen.getByText('Random: Single')).toBeInTheDocument();
    expect(screen.getByText('Custom...')).toBeInTheDocument();
  });

  it('disables shutter button when isReady is false', () => {
    render(<Fragment><CameraView {...defaultProps} isReady={false} /></Fragment>);
    
    expect(screen.getByTestId('shutter-button')).toBeDisabled();
  });

  it('disables shutter button when isDisabled is true', () => {
    render(<Fragment><CameraView {...defaultProps} isDisabled={true} /></Fragment>);
    
    expect(screen.getByTestId('shutter-button')).toBeDisabled();
  });

  it('calls onTakePhoto when clicking the shutter button', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    const button = screen.getByTestId('shutter-button');
    fireEvent.click(button);
    
    expect(defaultProps.onTakePhoto).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSettings when clicking the settings button', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    const button = screen.getByTestId('settings-button');
    fireEvent.click(button);
    
    expect(defaultProps.onToggleSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the settings button with ⚙️ icon when settings are closed', () => {
    render(<Fragment><CameraView {...defaultProps} showSettings={false} /></Fragment>);
    
    const settingsButton = screen.getByTestId('settings-button');
    expect(settingsButton.textContent).toBe('⚙️');
  });

  it('renders the settings button with ✕ icon when settings are open', () => {
    render(<Fragment><CameraView {...defaultProps} showSettings={true} /></Fragment>);
    
    const settingsButton = screen.getByTestId('settings-button');
    expect(settingsButton.textContent).toBe('✕');
  });

  it('calls onStyleSelect with correct style when clicking a style option', () => {
    render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    // Open the dropdown
    const styleButton = screen.getByTestId('style-button');
    fireEvent.click(styleButton);
    
    // Click a style option
    const animeOption = screen.getByText('Anime');
    fireEvent.click(animeOption);
    
    expect(defaultProps.onStyleSelect).toHaveBeenCalledWith('anime');
  });

  // Test for layout - these are basic tests to ensure the structure is maintained
  it('has the polaroid header positioned in the top white border', () => {
    const { container } = render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    // Get the polaroidHeader element
    const polaroidHeader = container.querySelector('[class^="polaroidHeader"]');
    expect(polaroidHeader).toHaveStyle('position: absolute');
    expect(polaroidHeader).toHaveStyle('top: 18px');
    expect(polaroidHeader).toHaveStyle('z-index: 1002');
  });

  it('has the shutter button properly centered', () => {
    const { container } = render(<Fragment><CameraView {...defaultProps} /></Fragment>);
    
    // Get the shutterButton element
    const shutterButton = container.querySelector('[class^="shutterButton"]');
    expect(shutterButton).toHaveStyle('margin: 0 auto');
  });
}); 