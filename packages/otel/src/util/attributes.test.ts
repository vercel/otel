import { describe, expect, it } from "vitest";
import {
  CLOUD_REGION,
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  PROCESS_RUNTIME_NAME,
  SERVICE_NAME,
  SERVICE_VERSION,
  VCS_REF_HEAD_NAME,
  VCS_REF_HEAD_REVISION,
  VCS_REF_TYPE,
  VCS_REPOSITORY_NAME,
  VCS_REPOSITORY_REF_REVISION,
} from "../semantic-resource-attributes";
import { getDefaultResourceAttributes } from "./attributes";

describe("getDefaultResourceAttributes", () => {
  it("should emit standard and legacy Vercel resource attributes", () => {
    const attributes = getDefaultResourceAttributes({
      env: {
        CI: "1",
        NODE_ENV: "production",
        VERCEL_BRANCH_URL: "feature-branch.vercel.app",
        VERCEL_DEPLOYMENT_ID: "dpl_123",
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feature/refactor",
        VERCEL_GIT_COMMIT_SHA: "abc123",
        VERCEL_GIT_PROVIDER: "github",
        VERCEL_GIT_REPO_OWNER: "vercel",
        VERCEL_GIT_REPO_SLUG: "otel",
        VERCEL_PROJECT_ID: "prj_123",
        VERCEL_REGION: "fra1",
        VERCEL_URL: "deployment.vercel.app",
      },
      runtime: "nodejs",
      serviceName: "app",
    });

    expect(attributes).toEqual({
      [CLOUD_REGION]: "fra1",
      [DEPLOYMENT_ENVIRONMENT_NAME]: "preview",
      [DEPLOYMENT_ID]: "dpl_123",
      [PROCESS_RUNTIME_NAME]: "nodejs",
      [SERVICE_NAME]: "app",
      [SERVICE_VERSION]: "dpl_123",
      [VCS_REF_HEAD_NAME]: "feature/refactor",
      [VCS_REF_HEAD_REVISION]: "abc123",
      [VCS_REF_TYPE]: "branch",
      [VCS_REPOSITORY_NAME]: "otel",
      [VCS_REPOSITORY_REF_REVISION]: "abc123",
      env: "preview",
      "node.ci": true,
      "node.env": "production",
      "vercel.branch_host": "feature-branch.vercel.app",
      "vercel.deployment_id": "dpl_123",
      "vercel.host": "deployment.vercel.app",
      "vercel.project_id": "prj_123",
      "vercel.region": "fra1",
      "vercel.runtime": "nodejs",
      "vercel.sha": "abc123",
    });
  });

  it("should preserve v1 NEXT_PUBLIC fallbacks", () => {
    const attributes = getDefaultResourceAttributes({
      env: {
        NEXT_PUBLIC_VERCEL_BRANCH_URL: "branch.vercel.app",
        NEXT_PUBLIC_VERCEL_ENV: "preview",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "abc123",
        NEXT_PUBLIC_VERCEL_URL: "deployment.vercel.app",
      },
      runtime: "nodejs",
      serviceName: "app",
    });

    expect(attributes[DEPLOYMENT_ENVIRONMENT_NAME]).toBe("preview");
    expect(attributes[VCS_REF_HEAD_REVISION]).toBe("abc123");
    expect(attributes["vercel.host"]).toBe("deployment.vercel.app");
    expect(attributes["vercel.branch_host"]).toBe("branch.vercel.app");
  });

  it("should merge user attributes last", () => {
    const attributes = getDefaultResourceAttributes({
      attributes: {
        [DEPLOYMENT_ID]: "custom-deploy",
        [DEPLOYMENT_ENVIRONMENT_NAME]: "custom-env",
      },
      env: {
        VERCEL_DEPLOYMENT_ID: "dpl_123",
        VERCEL_ENV: "preview",
      },
      runtime: "nodejs",
      serviceName: "app",
    });

    expect(attributes[DEPLOYMENT_ID]).toBe("custom-deploy");
    expect(attributes[DEPLOYMENT_ENVIRONMENT_NAME]).toBe("custom-env");
    expect(attributes["vercel.deployment_id"]).toBe("dpl_123");
    expect(attributes.env).toBe("preview");
  });
});
