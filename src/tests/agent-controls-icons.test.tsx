// src/tests/agent-controls-icons.test.tsx
import { describe, it, expect } from 'vitest';
import { agentIcons, agentAccentColors, agentDisplayOrder } from '@renderer/components/agent/AgentControls';

describe('AgentControls icon/color/order maps', () => {
  it('should have an icon entry for design-agent', () => {
    expect(agentIcons).toHaveProperty('design-agent');
  });

  it('should have an icon entry for marketing-agent', () => {
    expect(agentIcons).toHaveProperty('marketing-agent');
  });

  it('should have an accent color for design-agent', () => {
    expect(agentAccentColors['design-agent']).toBe('border-l-pink-500');
  });

  it('should have an accent color for marketing-agent', () => {
    expect(agentAccentColors['marketing-agent']).toBe('border-l-orange-500');
  });

  it('should have display order 4 for design-agent', () => {
    expect(agentDisplayOrder['design-agent']).toBe(4);
  });

  it('should have display order 5 for marketing-agent', () => {
    expect(agentDisplayOrder['marketing-agent']).toBe(5);
  });

  it('should sort design-agent after scout-agent and before marketing-agent', () => {
    const designOrder = agentDisplayOrder['design-agent'];
    const scoutOrder = agentDisplayOrder['scout-agent'];
    const marketingOrder = agentDisplayOrder['marketing-agent'];
    expect(designOrder).toBeGreaterThan(scoutOrder);
    expect(designOrder).toBeLessThan(marketingOrder);
  });

  it('should have an icon entry for qa-agent', () => {
    expect(agentIcons).toHaveProperty('qa-agent');
  });

  it('should have an accent color for qa-agent with border-l-red-500', () => {
    expect(agentAccentColors['qa-agent']).toBe('border-l-red-500');
  });

  it('should have display order 6 for qa-agent', () => {
    expect(agentDisplayOrder['qa-agent']).toBe(6);
  });

  it('should sort qa-agent after marketing-agent', () => {
    const qaOrder = agentDisplayOrder['qa-agent'];
    const marketingOrder = agentDisplayOrder['marketing-agent'];
    expect(qaOrder).toBeGreaterThan(marketingOrder);
  });
});
