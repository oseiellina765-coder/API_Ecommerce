import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stockQuantity: number;
  sku: string | null;
  categoryId: string | null;
  brand: string;
  imageUrl: string | null;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
}

export interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Cart {
  id: string;
  userId: string | null;
  sessionToken: string | null;
  items: CartItem[];
  total: number;
}

export interface Address {
  id: string;
  userId: string;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  postalCode: string | null;
  phoneNumber: string | null;
  defaultAddress: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  userId: string;
  shippingAddressId: string;
  status: string;
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class EcommerceApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  getProducts() {
    return this.http.get<Product[]>(`${this.base}/products/active`);
  }

  getCategories() {
    return this.http.get<Category[]>(`${this.base}/categories`);
  }

  createUser(user: Partial<User>) {
    return this.http.post<User>(`${this.base}/users`, user);
  }

  getUserByEmail(email: string) {
    return this.http.get<User>(`${this.base}/users/by-email`, {
      params: { email },
    });
  }

  getCart(userId: string) {
    return this.http.get<Cart>(`${this.base}/carts/user/${userId}`);
  }

  addCartItem(userId: string, productId: string, quantity = 1) {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<Cart>(
      `${this.base}/carts/items`,
      { productId, quantity },
      { params },
    );
  }

  updateCartItem(cartItemId: string, productId: string, quantity: number) {
    return this.http.put<Cart>(`${this.base}/carts/items/${cartItemId}`, {
      productId,
      quantity,
    });
  }

  removeCartItem(cartItemId: string) {
    return this.http.delete<void>(`${this.base}/carts/items/${cartItemId}`);
  }

  createAddress(userId: string, body: Record<string, unknown>) {
    return this.http.post<Address>(`${this.base}/addresses/user/${userId}`, body);
  }

  getAddresses(userId: string) {
    return this.http.get<Address[]>(`${this.base}/addresses/user/${userId}`);
  }

  createOrder(userId: string, shippingAddressId: string) {
    return this.http.post<Order>(`${this.base}/orders/user/${userId}`, {
      shippingAddressId,
    });
  }

  getAllOrders() {
    return this.http.get<Order[]>(`${this.base}/orders`);
  }

  getUserOrders(userId: string) {
    return this.http.get<Order[]>(`${this.base}/orders/user/${userId}`);
  }
}
