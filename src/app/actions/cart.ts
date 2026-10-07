"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addToCartCookie, clearCart, readCart, setCartLine, writeCart } from "@/lib/cart";
import { addToCartSchema, updateCartLineSchema } from "@/lib/validation";
import { getProductBySlug } from "@/lib/dal/catalog";

export interface CartActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

const CART_LIMITS = { max: 10 };

/**
 * Add a product to the cart.
 *
 * Availability is re-checked against the database here rather than trusted from
 * the form, so a sold-out item cannot be added by editing the request.
 */
export async function addToCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = addToCartSchema.safeParse({
    slug: formData.get("slug"),
    quantity: formData.get("quantity") ?? 1,
    buyNow: formData.get("buyNow") ?? false,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Could not add that item.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { slug, quantity, buyNow } = parsed.data;

  const product = await getProductBySlug(slug);
  if (!product) {
    return { ok: false, message: "That item is no longer available." };
  }
  if (product.stockQty <= 0) {
    return { ok: false, message: `“${product.name}” has sold out.` };
  }

  const cart = await readCart();
  const existing = cart.find((entry) => entry.slug === slug);
  const alreadyInCart = existing?.quantity ?? 0;
  const wanted = buyNow ? quantity : alreadyInCart + quantity;

  if (wanted > product.stockQty) {
    return {
      ok: false,
      message: `Only ${product.stockQty} of “${product.name}” available.`,
    };
  }
  if (wanted > CART_LIMITS.max) {
    return { ok: false, message: `You can order at most ${CART_LIMITS.max} units of one item.` };
  }

  if (buyNow) {
    // Buy now replaces the cart rather than adding to it.
    await writeCart([{ slug, quantity }]);
  } else {
    await addToCartCookie(slug, quantity);
  }

  revalidatePath("/cart");

  if (buyNow) {
    redirect("/checkout");
  }

  return { ok: true, message: `“${product.name}” added to your cart.` };
}

/** Set an exact quantity. Zero removes the line. */
export async function updateCartLineAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = updateCartLineSchema.safeParse({
    slug: formData.get("slug"),
    quantity: formData.get("quantity"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That quantity is not valid." };
  }

  const { slug, quantity } = parsed.data;

  if (quantity > 0) {
    const product = await getProductBySlug(slug);
    if (!product) {
      await setCartLine(slug, 0);
      revalidatePath("/cart");
      return { ok: false, message: "That item is no longer available, so it was removed." };
    }
    if (quantity > product.stockQty) {
      return { ok: false, message: `Only ${product.stockQty} available.` };
    }
  }

  await setCartLine(slug, quantity);
  revalidatePath("/cart");
  return { ok: true };
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  if (slug) await setCartLine(slug, 0);
  revalidatePath("/cart");
}

export async function clearCartAction(): Promise<void> {
  await clearCart();
  revalidatePath("/cart");
}
