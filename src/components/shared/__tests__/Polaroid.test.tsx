import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';
import Polaroid from '../Polaroid';

describe('Polaroid', () => {
  it('renders children content', () => {
    render(
      <Polaroid>
        <div data-testid="test-content">Test Content</div>
      </Polaroid>
    );
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('displays label when provided', () => {
    const label = 'Test Label';
    render(<Polaroid label={label}>Content</Polaroid>);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders bottom tab content when provided', () => {
    render(
      <Polaroid bottomTabContent={<button>Test Button</button>}>
        Content
      </Polaroid>
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(<Polaroid onClick={handleClick}>Content</Polaroid>);
    fireEvent.click(screen.getByText('Content'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('applies additional className when provided', () => {
    const { container } = render(
      <Polaroid className="test-class">Content</Polaroid>
    );
    expect(container.firstChild).toHaveClass('test-class');
  });

  it('applies custom styles when provided', () => {
    const customStyle = { backgroundColor: 'red' };
    const { container } = render(<Polaroid style={customStyle}>Content</Polaroid>);
    const polaroidElement = container.firstChild as HTMLElement;
    expect(polaroidElement).toHaveStyle('background-color: red');
  });

  it('adds data-testid when provided', () => {
    render(<Polaroid testId="test-id">Content</Polaroid>);
    expect(screen.getByTestId('test-id')).toBeInTheDocument();
  });
}); 