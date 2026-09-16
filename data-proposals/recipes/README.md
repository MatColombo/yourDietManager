# Recipe proposal batches

Each recipe-generation prompt adds one append-only JSON batch in this directory. `npm run recipes:publish` rebuilds the development catalog deterministically from T4E plus every batch in filename order.

Do not edit or replace an already deployed batch. Add a new batch for subsequent prompts or corrections.

Use the `recipe-catalog-author` Skill to create the batch.
