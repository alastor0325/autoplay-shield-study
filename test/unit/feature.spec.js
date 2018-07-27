/* eslint-env node, mocha, chai */
/* global browser, sinon, assert, Feature */

"use strict";

describe("feature.js", function() {
  describe("getBaseDomain() : should return the expected base domain", function() {
    it("test 1 : https", function() {
      const url = "https://www.test.com/";
      const expected = "test.com";
      assert.equal(expected, getBaseDomain(url));
    });
    it("test 2 : http", function() {
      const url = "http://www.test.com/";
      const expected = "test.com";
      assert.equal(expected, getBaseDomain(url));
    });
    it("test 3 : base domain", function() {
      const url = "http://test.com/";
      const expected = "test.com";
      assert.equal(expected, getBaseDomain(url));
    });
    it("test 4 : folder page", function() {
      const url = "http://www.test.com/test1/test2";
      const expected = "test.com";
      assert.equal(expected, getBaseDomain(url));
    });
  });
  describe("getBaseDomainHash()", function() {
    it("test 1 : hash should be consistent", function() {
      const url = "https://www.test.com/";
      const expected = getBaseDomainHash(url);
      assert.equal(expected, getBaseDomainHash(url));
    });
  });
  describe("isSupportURLProtocol()", function() {
    it("test 1 : support https", function() {
      const url = "https://www.test.com";
      assert.equal(true, isSupportURLProtocol(url));
    });
    it("test 2 : support http", function() {
      const url = "http://www.test.com";
      assert.equal(true, isSupportURLProtocol(url));
    });
    it("test 3 : does not support about:xxx", function() {
      const url = "about:config";
      assert.equal(false, isSupportURLProtocol(url));
    });
    it("test 4 : does not support view-source:xxx", function() {
      const url = "view-source:https://www.test.com";
      assert.equal(false, isSupportURLProtocol(url));
    });
  });
});
