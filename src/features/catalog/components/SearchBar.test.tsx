import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar Hybrid Mode', () => {
    const onSearch = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        onSearch.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('triggers search after debounce delay when typing', () => {
        render(<SearchBar onSearch={onSearch} debounceMs={500} />);
        const input = screen.getByLabelText(/Search by name or creator/i);

        fireEvent.change(input, { target: { value: 'test' } });

        // Should not trigger immediately
        expect(onSearch).not.toHaveBeenCalled();

        // Advance timers
        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(onSearch).toHaveBeenCalledWith('test');
        expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it('triggers search immediately when pressing Enter', () => {
        render(<SearchBar onSearch={onSearch} debounceMs={500} />);
        const input = screen.getByLabelText(/Search by name or creator/i);

        fireEvent.change(input, { target: { value: 'quick search' } });

        // Immediate trigger via Enter
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        expect(onSearch).toHaveBeenCalledWith('quick search');
        expect(onSearch).toHaveBeenCalledTimes(1);

        // Advance timers to ensure debounce doesn't trigger again
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it('triggers search immediately when clicking the magnifying glass', () => {
        render(<SearchBar onSearch={onSearch} debounceMs={500} />);
        const input = screen.getByLabelText(/Search by name or creator/i);
        const searchButton = screen.getByLabelText(/Run search/i);

        fireEvent.change(input, { target: { value: 'click search' } });

        // Immediate trigger via button
        fireEvent.click(searchButton);

        expect(onSearch).toHaveBeenCalledWith('click search');
        expect(onSearch).toHaveBeenCalledTimes(1);

        // Advance timers to ensure debounce doesn't trigger again
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it('intercepts redundant requests if input has not changed', () => {
        render(<SearchBar onSearch={onSearch} value="initial" debounceMs={500} />);
        const input = screen.getByLabelText(/Search by name or creator/i);
        const searchButton = screen.getByLabelText(/Run search/i);

        // Try to search for the same initial value
        fireEvent.click(searchButton);
        expect(onSearch).not.toHaveBeenCalled();

        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        expect(onSearch).not.toHaveBeenCalled();

        // Change value
        fireEvent.change(input, { target: { value: 'new' } });

        // Trigger manually
        fireEvent.click(searchButton);
        expect(onSearch).toHaveBeenCalledWith('new');
        expect(onSearch).toHaveBeenCalledTimes(1);

        // Try to trigger again with same 'new' value
        fireEvent.click(searchButton);
        expect(onSearch).toHaveBeenCalledTimes(1); // Still 1
    });

    it('cancels pending debounce when manual trigger is used', () => {
        render(<SearchBar onSearch={onSearch} debounceMs={500} />);
        const input = screen.getByLabelText(/Search by name or creator/i);

        fireEvent.change(input, { target: { value: 'part1' } });

        // Advance slightly but not enough for debounce
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(onSearch).not.toHaveBeenCalled();

        // Now trigger manually
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        expect(onSearch).toHaveBeenCalledWith('part1');

        // Advance the rest of the original debounce time
        act(() => {
            vi.advanceTimersByTime(300);
        });
        // Should not be called again
        expect(onSearch).toHaveBeenCalledTimes(1);
    });
});
