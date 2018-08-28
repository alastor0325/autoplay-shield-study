# Telemetry sent by this add-on

<!-- START doctoc generated TOC please keep comment here to allow auto update -->

<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

**Contents**

* [Usual Firefox Telemetry is mostly unaffected](#usual-firefox-telemetry-is-mostly-unaffected)
* [Study-specific endings](#study-specific-endings)
* [`block-autoplay` pings, specific to THIS study.](#block-autoplay-pings-specific-to-this-study)
* [Example sequence for ping](#example-sequence-for-ping)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Usual Firefox Telemetry is mostly unaffected

* No change: `main` and other pings are UNAFFECTED by this add-on, except that [shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) adds the add-on id as an active experiment in the telemetry environment.
* Respects telemetry preferences. If user has disabled telemetry, no telemetry will be sent.

## Study-specific endings

TBD

## `block-autoplay` pings, specific to THIS study.

The following is the content of the raw payload in the ping.

```
{
  // incremented integer, just to discriminate one blob from another
  "id": 2,

  // a label corresponding to which branch profile is in
  // branches are as following, besides "control" branch, other branches have
  // different default botton and check-boxed actions
  // 1) "control" (enable autoplay)
  // 2) "allow-and-notRemember"
  // 3) "deny-and-notRemember"
  // 4) "allow-and-remember"
  // 5) "deny-and-remember"
  "branch": "control",
  
  // contains testing contents
  "payload": {
    // this is identifies what information will be in this blob can be one of
    // 'prompt' or 'settings' or 'counts'. If user is in the 'control' brach,
    // the type would always be 'counts'.
    "type": "prompt",
  
    // [optional] 
    // this is only presented when type == "counts"
    "counters": {
      // this is either total # domains or total pages visited
      // it is running count till the data structure is sent back
      // and then reset to 0
      "totalPages": 200,

      // running total pages/domain names with auto-play media
      "totalPagesAM": 20,

      // running total of # of autoplay media blocked (in control group, this
      // means total # of autoplay media which might be blocked if disable
      // autoplay )
      "totalBlockedVideos": 20,
    },
     
    // [optional] 
    // this is only presented when type == "prompt", this is an array.
    "promptResponse": [
      {
        // hash of top level domain which is salted-hashed
        "pageid": "q3ewdwdad",

        // timestamp of when page was visited.
        "timestamp": 21231239123121,

        // User can either click a button, hit the
        // ‘escape’ key, or ignore it and do nothing.
        // The value of this attribute would be an enum
        // {interact, escape, ignore}
        “interact”: “interact”,

        // [optional] 
        // This is only presented when interact == "interact".
        // value of "remember this decision" checkbox
        "rememberCheckbox": true,

        // [optional] 
        // This is only presented when interact == "interact".
        // true if user clicked "Allow Autoplay", false if user clicked "Dont Allow".
        "allowAutoPlay": true
      },
    ],
    
    // [optional]
    // this is only presented when type == "settings", this is an array
    // MUST contain either globalSettings or pageSpecific
    "settingsChanged": [
      {
        // timestamp of when setting was changed.
        "timestamp": 21231239123121,

        // [optional] 
        // if a global setting was changed. 
        "globalSettings":{
            // the states are “allow”, “block” or “ask”
            "allowAutoPlay": “ask”
        },

        // [optional]
        // when user manually changed the settings for a page.
        "pageSpecific":{
          // hash of top level domain which is salted-hashed
          "pageid": "qwdqwdqded",

          // the states are “allow”, “block” or "default"
          "allowAutoPlay":“allow”
        }
      },
    ]
  }
}
```

## Example sequence for ping

These are the `payload` fields from all pings in the `shield-study` and `block-autoplay` buckets.

```

2018-08-01T14:16:18.042Z shield-study
{
  "study_state": "enter"
}

2018-08-01T14:16:18.055Z shield-study
{
  "study_state": "installed"
}

2018-08-01T14:16:18.066Z block-autoplay
{
  "id":0,
  "branch":"allow-and-remember",
  "payload" : {
    "type":"counts",
    "counters": {
      "totalPages":3,
      "totalPagesAM":1,
      "totalBlockedAudibleMedia":1,
    }
  }  
}

2018-08-01T16:29:44.109Z block-autoplay
{
  "id":1,
  "branch":"allow-and-remember",
  "payload": {
    "type":"prompt",
    "promptResponse":[
      {
        "pageId":109466335,
        "timestamp":1532567717284,
        "interact: "interact",
        "rememberCheckbox":false,
        "allowAutoPlay":false,
      },
      {
        "pageId":109466335,
        "timestamp":1532567719834,
        "interact: "escape",
      },
    ]
  }
}

2018-08-01T16:29:44.188Z block-autoplay
{
  "id":2,
  "branch":"allow-and-remember",
  "payload": {
    "type":"settings",
    "settingsChanged":[
      {
        "timestamp":1532567696509,
        "globalSettings":{
            "allowAutoPlay":1,
        },
      },
      {
        "timestamp":1532567697598,
        "globalSettings":{
            "allowAutoPlay":2,
        },
      },
      {
        "timestamp":1532567700984,
        "pageSpecific":{
            "pageId":1780114461,
            "allowAutoplay":true,
        },
      },
    ]
  }
}

2018-08-01T16:29:44.191Z shield-study
{
  "study_state": "exit"
}
```
