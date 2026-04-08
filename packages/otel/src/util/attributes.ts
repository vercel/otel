import type { Attributes } from "@opentelemetry/api";
import {
  CLOUD_REGION,
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  PROCESS_RUNTIME_NAME,
  SERVICE_NAME,
  SERVICE_VERSION,
  VCS_REF_HEAD_NAME,
  VCS_REF_HEAD_REVISION,
  VCS_REPOSITORY_NAME,
  VCS_REPOSITORY_REF_REVISION,
} from "../semantic-resource-attributes";

/** @internal */
export function omitUndefinedAttributes<T extends Attributes = Attributes>(
  obj: T,
): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  ) as T;
}

export function getDefaultResourceAttributes({
  attributes,
  env = process.env,
  runtime,
  serviceName,
}: {
  attributes?: Attributes;
  env?: NodeJS.ProcessEnv;
  runtime: string;
  serviceName: string;
}): Attributes {
  const deploymentEnvironment = env.VERCEL_ENV;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  const gitRevision = env.VERCEL_GIT_COMMIT_SHA;
  const region = env.VERCEL_REGION;
  const gitRef = env.VERCEL_GIT_COMMIT_REF;
  const repositoryName = env.VERCEL_GIT_REPO_SLUG;

  return omitUndefinedAttributes({
    [SERVICE_NAME]: serviceName,
    "node.ci": env.CI ? true : undefined,
    "node.env": env.NODE_ENV,
    [DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment,
    env: deploymentEnvironment,
    [CLOUD_REGION]: region,
    "vercel.region": region,
    [PROCESS_RUNTIME_NAME]: runtime,
    "vercel.runtime": runtime,
    [VCS_REF_HEAD_NAME]: gitRef,
    [VCS_REF_HEAD_REVISION]: gitRevision,
    [VCS_REPOSITORY_NAME]: repositoryName,
    [VCS_REPOSITORY_REF_REVISION]: gitRevision,
    "vercel.sha": gitRevision,
    "vercel.host": env.VERCEL_URL || undefined,
    "vercel.branch_host": env.VERCEL_BRANCH_URL || undefined,
    [DEPLOYMENT_ID]: deploymentId,
    "vercel.deployment_id": deploymentId,
    [SERVICE_VERSION]: deploymentId,
    "vercel.project_id": env.VERCEL_PROJECT_ID || undefined,
    ...attributes,
  });
}
