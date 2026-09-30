import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Cart,
  Category,
  EcommerceApi,
  Order,
  Product,
  User,
} from './services/ecommerce-api';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, CurrencyPipe],
  templateUrl: './app.html',
  styleUrls: ['./app.scss', './bag.scss', './journal.scss'],
})
export class App {
  private readonly api = inject(EcommerceApi);

  constructor() {
    afterNextRender(() => this.loadCatalog());
  }

  section = signal<'shop' | 'journal' | 'admin'>('shop');
  authenticated = signal(false);
  role = signal<'customer' | 'admin'>('customer');
  loginMode = signal<'login' | 'signup'>('login');
  bagOpen = signal(false);
  ordersOpen = signal(false);
  checkoutOpen = signal(false);
  checkoutSubmitting = signal(false);
  customerOrders = signal<Order[]>([]);
  ordersLoading = signal(false);
  ordersError = signal('');
  search = signal('');
  category = signal('All');
  toast = signal('');
  email = '';
  fullName = '';
  checkoutAddress = {
    addressLine: '',
    city: '',
    region: '',
    country: '',
    postalCode: '',
    phoneNumber: '',
  };
  currentUser = signal<User | null>(null);
  products = signal<Product[]>([]);
  categories = signal<Category[]>([]);
  cart = signal<Cart | null>(null);
  orders = signal<Order[]>([]);

  categoryNames = computed(() => [
    'All',
    ...this.categories().map((category) => category.name),
  ]);

  filtered = computed(() =>
    this.products().filter(
      (product) =>
        (this.category() === 'All' ||
          this.categoryName(product.categoryId) === this.category()) &&
        product.name.toLowerCase().includes(this.search().toLowerCase()),
    ),
  );

  count = computed(() =>
    (this.cart()?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
  );

  items = computed(() => {
    const cartItems = this.cart()?.items ?? [];
    return cartItems.map((item) => {
      const product = this.products().find((entry) => entry.id === item.productId);
      return {
        cartItemId: item.id,
        productId: item.productId,
        qty: item.quantity,
        name: product?.name ?? 'Product',
        category: this.categoryName(product?.categoryId ?? null),
        image: product?.imageUrl ?? '',
        price: Number(item.unitPrice),
      };
    });
  });

  total = computed(() => Number(this.cart()?.total ?? 0));
  pendingCount = computed(
    () =>
      this.orders().filter((order) =>
        ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status),
      ).length,
  );
  deliveredCount = computed(
    () => this.orders().filter((order) => order.status === 'DELIVERED').length,
  );
  cancelledCount = computed(
    () => this.orders().filter((order) => order.status === 'CANCELLED').length,
  );

  login(role: 'customer' | 'admin'): void {
    if (!this.email.trim()) {
      this.notice('Enter an email address');
      return;
    }
    if (this.loginMode() === 'signup') {
      const [firstName, ...rest] = this.fullName.trim().split(' ');
      this.api
        .createUser({
          firstName: firstName || 'Studio',
          lastName: rest.join(' ') || 'Member',
          email: this.email.trim(),
        })
        .subscribe({
          next: (user) => this.enter(user, role),
          error: (error) => this.notice(this.errorMessage(error, 'Could not create account')),
        });
      return;
    }

    this.api.getUserByEmail(this.email.trim()).subscribe({
      next: (user) => this.enter(user, role),
      error: () =>
        this.notice('No account found for that email. Create an account first.'),
    });
  }

  logout(): void {
    this.closeBag();
    this.authenticated.set(false);
    this.section.set('shop');
    this.currentUser.set(null);
    this.cart.set(null);
    this.orders.set([]);
  }

  add(product: Product): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    this.api.addCartItem(user.id, product.id).subscribe({
      next: (cart) => {
        this.cart.set(cart);
        this.notice(`${product.name} added to cart`);
      },
      error: (error) => this.notice(this.errorMessage(error, 'Could not add to cart')),
    });
  }

  toggleBag(): void {
    this.ordersOpen.set(false);
    this.section.set('shop');
    this.bagOpen.update((isOpen) => !isOpen);
    if (!this.bagOpen()) {
      this.checkoutOpen.set(false);
    }
  }

  closeBag(): void {
    this.bagOpen.set(false);
    this.ordersOpen.set(false);
    this.checkoutOpen.set(false);
  }

  toggleOrders(): void {
    const shouldOpen = !this.ordersOpen();
    this.closeBag();
    this.section.set('shop');
    this.ordersOpen.set(shouldOpen);
    if (shouldOpen) {
      this.refreshCustomerOrders();
    }
  }

  beginCheckout(): void {
    if (!this.count()) {
      this.notice('Your bag is empty');
      return;
    }
    this.checkoutOpen.set(true);
  }

  qty(cartItemId: string, productId: string, change: number): void {
    const item = this.cart()?.items.find((entry) => entry.id === cartItemId);
    if (!item) {
      return;
    }
    const nextQuantity = item.quantity + change;
    if (nextQuantity < 1) {
      this.api.removeCartItem(cartItemId).subscribe({
        next: () => this.refreshCart(),
        error: (error) => this.notice(this.errorMessage(error, 'Could not update bag')),
      });
      return;
    }
    this.api.updateCartItem(cartItemId, productId, nextQuantity).subscribe({
      next: (cart) => this.cart.set(cart),
      error: (error) => this.notice(this.errorMessage(error, 'Could not update bag')),
    });
  }

  removeItem(cartItemId: string, productName: string): void {
    this.api.removeCartItem(cartItemId).subscribe({
      next: () => {
        this.refreshCart();
        this.notice(`${productName} removed from cart`);
      },
      error: (error) => this.notice(this.errorMessage(error, 'Could not remove item')),
    });
  }

  checkout(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    if (!this.count()) {
      this.notice('Your bag is empty');
      return;
    }

    const { addressLine, city, region, country } = this.checkoutAddress;
    if (![addressLine, city, region, country].every((value) => value.trim())) {
      this.notice('Complete the required address fields');
      return;
    }

    this.checkoutSubmitting.set(true);
    this.api.createAddress(user.id, {
      addressLine: addressLine.trim(),
      city: city.trim(),
      region: region.trim(),
      country: country.trim(),
      postalCode: this.checkoutAddress.postalCode.trim() || null,
      phoneNumber: this.checkoutAddress.phoneNumber.trim() || null,
      defaultAddress: true,
    }).subscribe({
      next: (address) => this.placeOrder(user.id, address.id),
      error: (error) => {
        this.checkoutSubmitting.set(false);
        this.notice(`Checkout failed: ${this.errorMessage(error, 'Could not save address')}`);
      },
    });
  }

  categoryNameFor(categoryId: string | null): string {
    return this.categoryName(categoryId);
  }

  productNameFor(productId: string): string {
    return this.products().find((product) => product.id === productId)?.name ?? 'Product';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'DELIVERED':
        return 'delivered';
      case 'SHIPPED':
        return 'shipped';
      case 'PENDING':
      case 'CONFIRMED':
      case 'PROCESSING':
        return 'pending';
      default:
        return 'returned';
    }
  }

  notice(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(''), 2200);
  }

  private enter(user: User, role: 'customer' | 'admin'): void {
    this.currentUser.set(user);
    this.role.set(role);
    this.authenticated.set(true);
    this.section.set(role === 'admin' ? 'admin' : 'shop');
    this.notice(role === 'admin' ? 'Welcome back, Admin' : 'Welcome to Studio Supply');
    this.refreshCart();
    if (role === 'admin') {
      this.refreshOrders();
    } else {
      this.refreshCustomerOrders();
    }
  }

  private loadCatalog(): void {
    this.api.getProducts().subscribe({
      next: (products) => this.products.set(products),
      error: (error) => this.notice(this.errorMessage(error, 'Could not load products')),
    });
    this.api.getCategories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: (error) => this.notice(this.errorMessage(error, 'Could not load categories')),
    });
  }

  private refreshCart(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    this.api.getCart(user.id).subscribe({
      next: (cart) => this.cart.set(cart),
      error: (error) => this.notice(this.errorMessage(error, 'Could not load bag')),
    });
  }

  private refreshOrders(): void {
    this.api.getAllOrders().subscribe({
      next: (orders) => this.orders.set(orders),
      error: (error) => this.notice(this.errorMessage(error, 'Could not load orders')),
    });
  }

  private refreshCustomerOrders(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }

    this.ordersLoading.set(true);
    this.ordersError.set('');
    this.api.getUserOrders(user.id).subscribe({
      next: (orders) => {
        this.customerOrders.set(orders);
        this.ordersLoading.set(false);
      },
      error: (error) => {
        this.ordersError.set(this.errorMessage(error, 'Could not load your orders'));
        this.ordersLoading.set(false);
      },
    });
  }

  private placeOrder(userId: string, shippingAddressId: string): void {
    this.api.createOrder(userId, shippingAddressId).subscribe({
      next: (order) => {
        this.refreshCart();
        this.loadCatalog();
        this.refreshCustomerOrders();
        if (this.role() === 'admin') {
          this.refreshOrders();
        }
        this.checkoutSubmitting.set(false);
        this.checkoutAddress = {
          addressLine: '',
          city: '',
          region: '',
          country: '',
          postalCode: '',
          phoneNumber: '',
        };
        this.closeBag();
        this.notice(`Checkout successful. Order #${order.id.slice(0, 8)} placed`);
      },
      error: (error) => {
        this.checkoutSubmitting.set(false);
        this.notice(`Checkout failed: ${this.errorMessage(error, 'Could not place order')}`);
      },
    });
  }

  private categoryName(categoryId: string | null): string {
    return this.categories().find((category) => category.id === categoryId)?.name ?? '';
  }

  private errorMessage(error: HttpErrorResponse, fallback: string): string {
    const body = error.error as { error?: string } | string | null;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (body && typeof body === 'object' && body.error) {
      return body.error;
    }
    return fallback;
  }
}
