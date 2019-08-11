function deepEqual(a: any, b: any): boolean {
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    for (const key of aKeys) {
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  } else if (typeof a === "function" && typeof b === "function") {
    return true;
  } else {
    return a === b;
  }
}

type TestValue<A> = { value: A } | { error: any };

type TestResult<A> = [TestValue<A>, number];

export abstract class IO<A> {
  abstract run(): Promise<A>;
  abstract test(mocks: [IO<any>, any][], idx: number): TestResult<A>;
  static of<A>(a: A): IO<A> {
    return new PureIO(a);
  }
  of<A>(a: A): IO<A> {
    return new PureIO(a);
  }
  map<B>(f: (a: A) => B): IO<B> {
    return new FlatMapIO(this, (a) => IO.of(f(a)));
  }
  chain<B>(f: (a: A) => IO<B>): IO<B> {
    return new FlatMapIO(this, f);
  }
  flatMap<B>(f: (a: A) => IO<B>): IO<B> {
    return new FlatMapIO(this, f);
  }
}

class PureIO<A> extends IO<A> {
  constructor(private readonly a: A) {
    super();
  }
  run(): Promise<A> {
    return Promise.resolve(this.a);
  }
  test(_mocks: [IO<any>, any][], idx: number): TestResult<A> {
    return [{ value: this.a }, idx];
  }
}

class FlatMapIO<A, B> extends IO<B> {
  constructor(private readonly io: IO<A>, private readonly f: (a: A) => IO<B>) {
    super();
  }
  run() {
    return this.io.run().then((a) => this.f(a).run());
  }
  test(mocks: [IO<any>, any][], idx: number): TestResult<B> {
    const [value, newIdx] = this.io.test(mocks, idx);
    if ("value" in value) {
      return this.f(value.value).test(mocks, newIdx);
    } else {
      return [value, newIdx];
    }
  }
}

export function map<A, B>(f: (a: A) => B, io: IO<A>): IO<B> {
  return new FlatMapIO(io, (a) => IO.of(f(a)));
}

class CallPromiseIO<A, P extends any[]> extends IO<A> {
  constructor(
    private readonly f: (...args: P) => Promise<A>,
    private readonly args: P
  ) {
    super();
  }
  run(): Promise<A> {
    return this.f(...this.args);
  }
  test(mocks: [IO<any>, any][], idx: number): TestResult<A> {
    if (!deepEqual(this, mocks[idx][0])) {
      throw new Error(
        `Value invalid, expected ${mocks[idx][0]} but saw ${this}`
      );
    }
    return [{ value: mocks[idx][1] }, idx + 1];
  }
}

// in the IO monad
export function withEffects<A, P extends any[]>(
  f: (...args: P) => A
): (...args: P) => IO<A> {
  return (...args: P) =>
    new CallPromiseIO((...a) => Promise.resolve(f(...a)), args);
}

export function withEffectsP<A, P extends any[]>(
  f: (...args: P) => Promise<A>
): (...args: P) => IO<A> {
  return (...args: P) => new CallPromiseIO(f, args);
}

export function call<A, P extends any[]>(
  f: (...args: P) => A,
  ...args: P
): IO<A> {
  return new CallPromiseIO((...a) => Promise.resolve(f(...a)), args);
}

export function callP<A, P extends any[]>(
  f: (...args: P) => Promise<A>,
  ...args: P
): IO<A> {
  return new CallPromiseIO(f, args);
}

class ThrowErrorIO extends IO<any> {
  constructor(private readonly error: any) {
    super();
  }
  run(): Promise<any> {
    return Promise.reject(this.error);
  }
  test(_mocks: [IO<any>, any][], idx: number): TestResult<any> {
    return [{ error: this.error }, idx];
  }
}

export function throwE(error: any): IO<any> {
  return new ThrowErrorIO(error);
}

class CatchErrorIO<A, B> extends IO<A | B> {
  constructor(
    private readonly io: IO<A>,
    private readonly errorHandler: (err: any) => IO<B>
  ) {
    super();
  }
  run(): Promise<any> {
    return this.io.run().catch((err) => this.errorHandler(err).run());
  }
  test(mocks: [IO<any>, any][], idx: number): TestResult<A | B> {
    const [value, nextIdx] = this.io.test(mocks, idx);
    if ("value" in value) {
      return [value, nextIdx];
    } else {
      return this.errorHandler(value.error).test(mocks, nextIdx);
    }
  }
}

export function catchE(
  errorHandler: (error: any) => IO<any>,
  io: IO<any>
): IO<any> {
  return new CatchErrorIO(io, errorHandler);
}

export function runIO<A>(e: IO<A>): Promise<A> {
  return e.run();
}

export function testIO<A>(io: IO<A>, mocks: any[], expectedResult: A): void {
  const [value] = io.test(mocks, 0);
  if ("value" in value) {
    if (!deepEqual(value.value, expectedResult)) {
      throw new Error(
        `Value invalid, expected ${expectedResult} but saw ${value.value}`
      );
    }
  }
}
