# Changesets

Every pull request that changes the site needs a changeset: run `pnpm changeset`, pick a bump, and describe the change
in a sentence a visitor would understand. Merging to `main` collects pending changesets into a "version" pull request;
merging that pull request deploys wrapped.mia.cx.
