import assert from "node:assert/strict";
import test from "node:test";
import { isLightGroup } from "./light-group.mjs";
test("room labels do not define physical lamps; provider membership does", () => {
  assert.equal(isLightGroup({friendly_name:"Büro",is_hue_group:true}),true);
  assert.equal(isLightGroup({entity_id:["light.one","light.two"]}),true);
  assert.equal(isLightGroup({friendly_name:"Wohnzimmer",brightness:100}),false);
  assert.equal(isLightGroup({entity_id:[],is_hue_group:false}),false);
  assert.equal(isLightGroup(null),false);
});
