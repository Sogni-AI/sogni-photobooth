import React, { useState, KeyboardEvent, useMemo, useCallback } from 'react';
import './TagInput.css';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Move color array outside component to prevent recreation on every render
const TAG_COLORS = [
  'linear-gradient(135deg, #FF6B6B, #FF5252)',
  'linear-gradient(135deg, #4ECDC4, #26C6DA)', 
  'linear-gradient(135deg, #45B7D1, #2196F3)',
  'linear-gradient(135deg, #96CEB4, #66BB6A)',
  'linear-gradient(135deg, #FFEAA7, #FFCA28)',
  'linear-gradient(135deg, #DDA0DD, #BA68C8)',
  'linear-gradient(135deg, #98D8C8, #4DB6AC)',
  'linear-gradient(135deg, #F7DC6F, #FDD835)',
  'linear-gradient(135deg, #BB8FCE, #9C27B0)',
  'linear-gradient(135deg, #85C1E9, #42A5F5)',
  'linear-gradient(135deg, #F8C471, #FF9800)',
  'linear-gradient(135deg, #82E0AA, #4CAF50)',
  'linear-gradient(135deg, #F1948A, #E57373)',
  'linear-gradient(135deg, #AED6F1, #64B5F6)',
  'linear-gradient(135deg, #D7BDE2, #CE93D8)'
];

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onTagsChange,
  placeholder = "Type and press Enter to add...",
  className = "",
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState('');

  const getTagColor = useMemo(() => (index: number) => {
    return TAG_COLORS[index % TAG_COLORS.length];
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return; // Don't handle key events when disabled
    
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      
      // Don't add duplicate tags
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
      
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      onTagsChange(tags.slice(0, -1));
    }
  }, [inputValue, tags, onTagsChange, disabled]);

  const removeTag = useCallback((indexToRemove: number) => {
    if (disabled) return; // Don't allow tag removal when disabled
    onTagsChange(tags.filter((_, index) => index !== indexToRemove));
  }, [tags, onTagsChange, disabled]);

  return (
    <div className={`tag-input-container ${className} ${disabled ? 'disabled' : ''}`}>
      <div className={`tag-input-wrapper ${disabled ? 'disabled' : ''}`}>
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className={`tag-pill ${disabled ? 'disabled' : ''}`}
            style={{ background: disabled ? '#666' : getTagColor(index) }}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                className="tag-remove-btn"
                onClick={() => removeTag(index)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={disabled ? '' : inputValue}
          onChange={(e) => !disabled && setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className={`tag-input-field ${disabled ? 'disabled' : ''}`}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-form-type="other"
        />
      </div>
    </div>
  );
};

export default TagInput;
