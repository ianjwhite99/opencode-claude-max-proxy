/**
 * Unit tests for model mapping and utility functions.
 */
import { describe, it, expect } from "bun:test"
import { mapModelToClaudeModel, isClosedControllerError, stripExtendedContext, hasExtendedContext } from "../proxy/models"

describe("mapModelToClaudeModel", () => {
  it("maps opus 4.6 models to opus[1m]", () => {
    expect(mapModelToClaudeModel("claude-opus-4-6")).toBe("opus[1m]")
    expect(mapModelToClaudeModel("opus")).toBe("opus[1m]")
  })

  it("maps opus 4.5 models to opus (no 1M)", () => {
    expect(mapModelToClaudeModel("claude-opus-4-5")).toBe("opus")
  })

  it("maps haiku models to haiku", () => {
    expect(mapModelToClaudeModel("claude-haiku-4-5")).toBe("haiku")
    expect(mapModelToClaudeModel("haiku")).toBe("haiku")
  })

  it("maps sonnet 4.6 models to sonnet[1m]", () => {
    expect(mapModelToClaudeModel("claude-sonnet-4-6")).toBe("sonnet[1m]")
    expect(mapModelToClaudeModel("sonnet")).toBe("sonnet[1m]")
  })

  it("maps sonnet 4.5 models to sonnet (no 1M)", () => {
    expect(mapModelToClaudeModel("claude-sonnet-4-5")).toBe("sonnet")
    expect(mapModelToClaudeModel("claude-sonnet-4-5-20250929")).toBe("sonnet")
  })

  it("defaults to sonnet[1m] for unknown models", () => {
    expect(mapModelToClaudeModel("unknown-model")).toBe("sonnet[1m]")
    expect(mapModelToClaudeModel("")).toBe("sonnet[1m]")
  })
})

describe("stripExtendedContext", () => {
  it("strips [1m] from opus", () => {
    expect(stripExtendedContext("opus[1m]")).toBe("opus")
  })

  it("strips [1m] from sonnet", () => {
    expect(stripExtendedContext("sonnet[1m]")).toBe("sonnet")
  })

  it("returns haiku unchanged", () => {
    expect(stripExtendedContext("haiku")).toBe("haiku")
  })

  it("returns base models unchanged", () => {
    expect(stripExtendedContext("opus")).toBe("opus")
    expect(stripExtendedContext("sonnet")).toBe("sonnet")
  })
})

describe("hasExtendedContext", () => {
  it("returns true for [1m] models", () => {
    expect(hasExtendedContext("opus[1m]")).toBe(true)
    expect(hasExtendedContext("sonnet[1m]")).toBe(true)
  })

  it("returns false for base models", () => {
    expect(hasExtendedContext("opus")).toBe(false)
    expect(hasExtendedContext("sonnet")).toBe(false)
    expect(hasExtendedContext("haiku")).toBe(false)
  })
})

describe("isClosedControllerError", () => {
  it("returns true for Controller is already closed error", () => {
    expect(isClosedControllerError(new Error("Controller is already closed"))).toBe(true)
  })

  it("returns true when message contains the phrase", () => {
    expect(isClosedControllerError(new Error("Error: Controller is already closed foo"))).toBe(true)
  })

  it("returns false for other errors", () => {
    expect(isClosedControllerError(new Error("something else"))).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isClosedControllerError("string")).toBe(false)
    expect(isClosedControllerError(null)).toBe(false)
    expect(isClosedControllerError(undefined)).toBe(false)
    expect(isClosedControllerError(42)).toBe(false)
  })
})
