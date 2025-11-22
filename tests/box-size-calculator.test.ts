import { describe, it, expect } from 'vitest';
import {
    utf8ByteLength,
    calculateProjectContentBytes,
    validateProjectContent,
    getRemainingBytes,
    getUsagePercentage,
    MAX_R9_BYTES,
    type ProjectContent
} from '$lib/ergo/utils/box-size-calculator';

describe('box-size-calculator', () => {
    describe('utf8ByteLength', () => {
        it('should calculate correct byte length for ASCII text', () => {
            expect(utf8ByteLength('hello')).toBe(5);
        });

        it('should calculate correct byte length for UTF-8 text', () => {
            // "ñ" is 2 bytes in UTF-8
            expect(utf8ByteLength('año')).toBe(4);
            // "€" is 3 bytes in UTF-8
            expect(utf8ByteLength('10€')).toBe(5);
        });

        it('should return 0 for empty string', () => {
            expect(utf8ByteLength('')).toBe(0);
        });
    });

    describe('calculateProjectContentBytes', () => {
        it('should calculate bytes for simple project content', () => {
            const content: ProjectContent = {
                title: 'Test',
                description: 'Desc',
                image: 'img',
                link: 'link'
            };
            // JSON.stringify adds quotes, colons, braces, etc.
            const expected = utf8ByteLength(JSON.stringify(content));
            expect(calculateProjectContentBytes(content)).toBe(expected);
        });

        it('should account for all fields in the JSON', () => {
            const content: ProjectContent = {
                title: 'My Project',
                description: 'This is a test project description',
                image: 'https://example.com/image.png',
                link: 'https://example.com'
            };
            const jsonString = JSON.stringify(content);
            expect(calculateProjectContentBytes(content)).toBe(utf8ByteLength(jsonString));
        });
    });

    describe('validateProjectContent', () => {
        it('should validate within limit', () => {
            const content: ProjectContent = {
                title: 'Short',
                description: 'Brief description',
                image: 'image.png',
                link: 'link.com'
            };
            const result = validateProjectContent(content);
            expect(result.isValid).toBe(true);
            expect(result.currentBytes).toBeLessThan(MAX_R9_BYTES);
        });

        it('should reject content exceeding limit', () => {
            // Create a very large description
            const largeDesc = 'a'.repeat(MAX_R9_BYTES);
            const content: ProjectContent = {
                title: 'Title',
                description: largeDesc,
                image: 'image',
                link: 'link'
            };
            const result = validateProjectContent(content);
            expect(result.isValid).toBe(false);
            expect(result.message).toBeDefined();
            expect(result.currentBytes).toBeGreaterThan(MAX_R9_BYTES);
        });
    });

    describe('getRemainingBytes', () => {
        it('should calculate remaining bytes correctly', () => {
            const content: ProjectContent = {
                title: 'Test',
                description: 'Test',
                image: 'test',
                link: 'test'
            };
            const used = calculateProjectContentBytes(content);
            const remaining = getRemainingBytes(content);
            expect(remaining).toBe(MAX_R9_BYTES - used);
        });

        it('should return 0 when over limit', () => {
            const largeDesc = 'a'.repeat(MAX_R9_BYTES);
            const content: ProjectContent = {
                title: 'T',
                description: largeDesc,
                image: 'i',
                link: 'l'
            };
            const remaining = getRemainingBytes(content);
            expect(remaining).toBe(0);
        });
    });

    describe('getUsagePercentage', () => {
        it('should calculate percentage correctly', () => {
            const content: ProjectContent = {
                title: '',
                description: '',
                image: '',
                link: ''
            };
            const percentage = getUsagePercentage(content);
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
        });

        it('should handle full usage', () => {
            // Create content exactly at limit
            const desc = 'a'.repeat(MAX_R9_BYTES - 100); // Leave room for JSON structure
            const content: ProjectContent = {
                title: '',
                description: desc,
                image: '',
                link: ''
            };
            const percentage = getUsagePercentage(content);
            expect(percentage).toBeGreaterThan(80); // Should be close to 100%
        });
    });
});
