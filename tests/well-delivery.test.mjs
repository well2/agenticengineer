import assert from 'node:assert/strict';
import test from 'node:test';
import { createWellDelivery, getDeliveryReveal, getDeliveryState } from '../js/well-delivery.js';

function receipt() {
    const values = new Map();
    return { hidden: true, dataset: {}, values,
        setAttribute(key, value) { values.set(key, value); },
        style: { setProperty(key, value) { values.set(key, value); } },
    };
}

test('the application emerges during transformation and stays assembled afterward', () => {
    assert.equal(getDeliveryReveal(0.35, true), 0);
    const element = receipt();
    const delivery = createWellDelivery(element);
    delivery.update(0.7, true);
    assert.equal(element.hidden, false);
    assert.equal(element.values.get('aria-hidden'), 'true');
    assert.ok(Number(element.values.get('--delivery-progress')) > 0);
    delivery.update(null, true);
    assert.equal(element.values.get('--delivery-progress'), '1');
    assert.equal(element.values.get('aria-hidden'), 'false');
    assert.equal(element.dataset.complete, 'true');
});

test('empty attempts and a new descent hide the previous delivery', () => {
    const element = receipt();
    const delivery = createWellDelivery(element);
    delivery.update(null, false);
    assert.equal(element.hidden, true);
    delivery.update(null, true);
    delivery.update(null, false);
    assert.equal(element.hidden, true);
    assert.equal(element.values.get('aria-hidden'), 'true');
    assert.equal(element.dataset.complete, 'false');
});

test('motion progress is bounded, continuous and removed in reduced motion', () => {
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
        const current = getDeliveryReveal(step / 100, true);
        assert.ok(current >= previous && current <= 1);
        previous = current;
    }
    assert.equal(getDeliveryReveal(-1, true), 0);
    assert.equal(getDeliveryReveal(2, true), 1);
    assert.equal(getDeliveryReveal(0.8, true, true), 0);
    assert.equal(getDeliveryReveal(null, true, true), 1);
});

test('invalid progress fails before changing a visible receipt', () => {
    const element = receipt();
    const delivery = createWellDelivery(element);
    delivery.update(null, true);
    for (const progress of [NaN, Infinity, undefined, '0.5']) {
        assert.throws(() => delivery.update(progress, true), TypeError);
        assert.equal(element.hidden, false);
        assert.equal(element.values.get('--delivery-progress'), '1');
    }
});

test('missing optional markup and repeated disposal are safe', () => {
    assert.doesNotThrow(() => createWellDelivery(null).update(null, true));
    const element = receipt();
    const delivery = createWellDelivery(element);
    delivery.update(null, true);
    delivery.dispose();
    delivery.dispose();
    assert.equal(element.hidden, true);
    assert.equal(element.values.get('aria-hidden'), 'true');
});

test('the frame precedes individual modules and verification finishes the composition', () => {
    const frame = getDeliveryState(0.46, true);
    assert.ok(frame.frame > 0 && frame.frame < 1);
    assert.deepEqual(frame.parts, [0, 0, 0, 0, 0]);
    const assembling = getDeliveryState(0.66, true);
    assert.ok(assembling.parts[0] > assembling.parts[1]);
    assert.ok(assembling.parts[1] > assembling.parts[2]);
    assert.equal(assembling.parts.at(-1), 0);
    assert.equal(assembling.verify, 0);
    const complete = getDeliveryState(null, true);
    assert.deepEqual(complete.parts, [1, 1, 1, 1, 1]);
    assert.equal(complete.verify, 1);
    assert.equal(complete.settle, 1);
    assert.ok(Math.abs(complete.glow) < 1e-10);
});

test('DOM frame uses the same projected center and width as the particle destination', () => {
    const element = receipt();
    createWellDelivery(element).update(0.7, true, false, { x: 175, y: 64, width: 224 });
    assert.equal(element.values.get('--creation-x'), '175px');
    assert.equal(element.values.get('--creation-y'), '64px');
    assert.equal(element.values.get('--creation-width'), '224px');
    assert.ok(Number(element.values.get('--creation-part-0')) > Number(element.values.get('--creation-part-4')));
});

test('invalid projections fail before touching an already assembled interface', () => {
    const element = receipt();
    const delivery = createWellDelivery(element);
    delivery.update(null, true, false, { x: 175, y: 64, width: 224 });
    const before = [...element.values];
    for (const anchor of [{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1, y: 1, width: -1 }]) {
        assert.throws(() => delivery.update(0.5, true, false, anchor), TypeError);
        assert.deepEqual([...element.values], before);
    }
});
