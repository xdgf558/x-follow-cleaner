import assert from "node:assert/strict";
import test from "node:test";

import { MutualFollowStatus } from "../src/shared/constants.js";
import { buildProfileActivityPatch } from "../src/shared/statusUtils.js";

const checkedAt = "2026-06-01T12:00:00.000Z";
const recentResult = {
  ok: true,
  username: "demo",
  lastPostAt: "2026-05-31T12:00:00.000Z",
  inactiveDays: 1
};
const settings = { inactiveThresholdDays: 30 };

test("does not mark first not-following read as suspected unfollow", () => {
  const patch = buildProfileActivityPatch(
    { username: "demo" },
    {
      ...recentResult,
      mutualFollowStatus: MutualFollowStatus.NOT_FOLLOWING_YOU
    },
    settings,
    checkedAt
  );

  assert.equal(patch.mutualFollowStatus, MutualFollowStatus.NOT_FOLLOWING_YOU);
  assert.equal(patch.suspectedUnfollow, false);
});

test("marks suspected unfollow only after previous follows-you state", () => {
  const patch = buildProfileActivityPatch(
    {
      username: "demo",
      mutualFollowStatus: MutualFollowStatus.FOLLOWS_YOU
    },
    {
      ...recentResult,
      mutualFollowStatus: MutualFollowStatus.NOT_FOLLOWING_YOU
    },
    settings,
    checkedAt
  );

  assert.equal(patch.suspectedUnfollow, true);
  assert.equal(patch.suspectedUnfollowAt, checkedAt);
});

test("preserves previous mutual state when the current read is unknown", () => {
  const patch = buildProfileActivityPatch(
    {
      username: "demo",
      mutualFollowStatus: MutualFollowStatus.FOLLOWS_YOU
    },
    {
      ...recentResult,
      mutualFollowStatus: MutualFollowStatus.UNKNOWN
    },
    settings,
    checkedAt
  );

  assert.equal(patch.mutualFollowStatus, MutualFollowStatus.FOLLOWS_YOU);
});
