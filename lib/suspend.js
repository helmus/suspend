module.exports = new SuspendInitializer().start;

function Suspend(generator, opts) {
	var self = this;

	this.generator = generator;
	this.opts = opts || {};
	this.done = false;
	this.rawOnce = false;
	this.syncFlag = false;
	this.syncArgs = null;

	this.resetSyncFlag = function() {
		self.syncFlag = false;
		if (self.syncArgs) {
			self.resumer.apply(self, self.syncArgs);
		}
	};
	this.setSyncFlag = function() {
		self.syncFlag = true;
		self.syncArgs = null;
		setImmediate(self.resetSyncFlag);
	};
	// reusable, chainable bound reference of resume
	this.resumer = function() {
		var args = arguments;
		if (self.syncFlag) {
			self.syncFlag = false;
			self.syncArgs = args;
		} else {
			self.setSyncFlag();
			self.resume.apply(self, args);
		}
	}
	this.resumer.raw = function() {
		self.rawOnce = true;
		return self.resumer;
	};
}

Suspend.prototype.startGenerator = function startGenerator(ctx, args) {
	args.push(this.resumer);
	this.iterator = this.generator.apply(ctx, args);
	this.setSyncFlag();
	this.handleYield(this.iterator.next());
};

Suspend.prototype.handleYield = function handleYield(result) {
	// are we done?
	if (result.done) {
		this.done = true;
		return;
	}

	var resumable = result.value;

	// bail out if no yielded value is given (assume resume will be passed manually)
	if (!resumable) return;

	// otherwise, see if it's a promise ("thenable")
	if (typeof resumable.then === 'function') {
		resumable.then(this.resumer.bind(this, null), this.resumer);
	}
};

Suspend.prototype.resume = function resume(err) {
	if (this.done) {
		throw new Error('Resume invoked after generator was complete. Check for multiple callbacks.');
	}

	if (this.opts.raw || this.rawOnce) {
		var ret = Array.prototype.slice.call(arguments);
		this.rawOnce && (this.rawOnce = false);
	} else {
		if (err) return this.iterator.throw(err);
		ret = arguments[1];
	}

	// temporary backwards compat for .send(val) instead of .next(val) in node 0.11.2
	if (this.iterator.send) {
		this.handleYield(this.iterator.send(ret));
	} else {
		this.handleYield(this.iterator.next(ret));
	}
};

function SuspendInitializer() {
	var self = this;

	this.raw = false;

	this.start = function(generator) {
		return function() {
			var suspend = new Suspend(generator, { raw: self.raw });
			suspend.startGenerator(this, Array.prototype.slice.call(arguments));
		};
	};

	this.start.raw = function(enableRaw) {
		var initializer = new SuspendInitializer(self.defaults);
		initializer.raw = arguments.length ? enableRaw : true;
		return initializer.start;
	};
}
