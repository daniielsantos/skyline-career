import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boardMoneyLabel,
  boardNetClassName,
  formatBoardDistanceNm,
  formatBoardMoney,
  formatUsdAmountInput,
  isFiniteMoney,
  maskUsdAmountInput,
  parseUsdAmountInput,
} from './board-money.ts';

test('isFiniteMoney rejects null NaN and non-numbers', () => {
  assert.equal(isFiniteMoney(0), true);
  assert.equal(isFiniteMoney(-12.5), true);
  assert.equal(isFiniteMoney(null), false);
  assert.equal(isFiniteMoney(undefined), false);
  assert.equal(isFiniteMoney(Number.NaN), false);
  assert.equal(isFiniteMoney(Number.POSITIVE_INFINITY), false);
  assert.equal(isFiniteMoney('100' as unknown), false);
});

test('formatBoardMoney never calls toLocaleString on null', () => {
  assert.equal(formatBoardMoney(null), '—');
  assert.equal(formatBoardMoney(Number.NaN), '—');
  assert.match(formatBoardMoney(2900), /^\$2[\D]?900$/);
});

test('boardMoneyLabel uses caller formatter only for finite values', () => {
  const money = (n: number) => `USD ${n}`;
  assert.equal(boardMoneyLabel(null, money), '—');
  assert.equal(boardMoneyLabel(Number.NaN, money), '—');
  assert.equal(boardMoneyLabel(4100, money), 'USD 4100');
});

test('boardNetClassName tones finite nets and stays neutral otherwise', () => {
  assert.equal(boardNetClassName(120), 'net net-pos');
  assert.equal(boardNetClassName(-40), 'net net-neg');
  assert.equal(boardNetClassName(0), 'net');
  assert.equal(boardNetClassName(null), 'net');
  assert.equal(boardNetClassName(50, { inRange: false }), 'net');
});

test('formatBoardDistanceNm survives null distance', () => {
  assert.equal(formatBoardDistanceNm(null), '—');
  assert.equal(formatBoardDistanceNm(196.4), '196 nm');
});

test('maskUsdAmountInput groups whole dollars while typing', () => {
  assert.equal(maskUsdAmountInput(''), '');
  assert.equal(maskUsdAmountInput('22593'), '22,593');
  assert.equal(maskUsdAmountInput('22,593'), '22,593');
  assert.equal(maskUsdAmountInput('$1,200.50'), '1,200');
  assert.equal(parseUsdAmountInput('22,593'), 22593);
  assert.equal(parseUsdAmountInput(''), 0);
  assert.equal(formatUsdAmountInput(22593.9), '22,593');
  assert.equal(formatUsdAmountInput(0), '');
});
