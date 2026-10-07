import { deleteCategoryAction, saveCategoryAction } from "@/app/actions/admin";
import { listAdminCategories } from "@/lib/dal/admin";
import { one } from "@/components/admin/format";
import { Field, Notice, PageHeader } from "@/components/admin/ui";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const categories = await listAdminCategories();

  return (
    <>
      <PageHeader
        title="Categories"
        description="These are the departments customers browse. A category with products cannot be deleted."
      />
      <Notice error={one(query.error)} saved={one(query.saved) === "1"} />

      <form action={saveCategoryAction} className="card mb-6 grid gap-3 p-5 sm:grid-cols-2">
        <h2 className="font-bold text-ink-900 sm:col-span-2">New category</h2>
        <Field label="Name">
          <input className="input" name="name" required />
        </Field>
        <Field label="Sort order">
          <input className="input" name="sortOrder" type="number" min={0} defaultValue={0} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input className="input" name="description" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
          <input type="checkbox" name="isActive" defaultChecked />
          Visible on the store
        </label>
        <div className="sm:text-right">
          <button type="submit" className="btn btn-primary">
            Add category
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {categories.map((category) => (
          <li key={category.id} className="card p-4">
            <form action={saveCategoryAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={category.id} />
              <Field label="Name">
                <input className="input" name="name" required defaultValue={category.name} />
              </Field>
              <Field label="Slug">
                <input className="input" name="slug" defaultValue={category.slug} />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <input className="input" name="description" defaultValue={category.description ?? ""} />
              </Field>
              <Field label="Sort order">
                <input className="input" name="sortOrder" type="number" min={0} defaultValue={category.sortOrder} />
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-ink-700">
                <input type="checkbox" name="isActive" defaultChecked={category.isActive} />
                Visible · {category._count.products} products
              </label>
              <div>
                <button type="submit" className="btn btn-secondary btn-sm">
                  Save
                </button>
              </div>
            </form>
            <form action={deleteCategoryAction} className="mt-2">
              <input type="hidden" name="id" value={category.id} />
              <button type="submit" className="btn btn-ghost btn-sm text-danger-600">
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
