import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProgress, shouldOfferTour, hasUnreadUpdates, initialCenterTab, advanceTour, mergeProgress} from '../../src/features/onboarding/onboarding-state.mjs';

test('only stale tour versions are offered automatically and completed tours can be replayed', () => {
  assert.equal(shouldOfferTour(0,1),true);
  assert.equal(shouldOfferTour(1,1),false);
  assert.equal(shouldOfferTour(2,1),false);
  assert.equal(shouldOfferTour(2,1,true),true);
});

test('update badges compare dotted versions numerically, including older installations', () => {
  assert.equal(hasUnreadUpdates('', '2026.11.26'),true);
  assert.equal(hasUnreadUpdates('1.9', '1.10'),true);
  assert.equal(hasUnreadUpdates('1.10', '1.10'),false);
  assert.equal(hasUnreadUpdates('1.11', '1.10'),false);
});

test('each opening of the center starts on updates only while there is an unread version', () => {
  const version='2026.11.26';
  const progress={...emptyProgress,lastSeenChangelog:'2026.11.25'};
  assert.equal(initialCenterTab(hasUnreadUpdates(progress.lastSeenChangelog,version)),'updates');
  const read=mergeProgress(progress,{lastSeenChangelog:version});
  assert.equal(initialCenterTab(hasUnreadUpdates(read.lastSeenChangelog,version)),'guide');
  assert.equal(initialCenterTab(hasUnreadUpdates(read.lastSeenChangelog,'2026.11.27')),'updates');
});

test('tour starts from welcome, respects edges and closes on finish or skip', () => {
  assert.equal(advanceTour(-1,'back',4),-1);
  assert.equal(advanceTour(-1,'next',4),0);
  assert.equal(advanceTour(0,'back',4),0);
  assert.equal(advanceTour(2,'next',4),3);
  assert.equal(advanceTour(3,'next',4),null);
  assert.equal(advanceTour(1,'skip',3),null);
});

test('late reads and partial updates never undo progress on another device', () => {
  const newer={homeTourVersion:2,workbenchTourVersion:0,lastSeenChangelog:'1.10',updatedAt:'later'};
  assert.deepEqual(mergeProgress(newer,{homeTourVersion:1,workbenchTourVersion:3,lastSeenChangelog:'1.9'}),
    {...newer,workbenchTourVersion:3});
});
